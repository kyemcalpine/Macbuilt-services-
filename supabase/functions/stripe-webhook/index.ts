import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@17.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

function sanitizeError(err: unknown, stage: string) {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as Record<string, unknown>;
    return {
      message: typeof e.message === "string" ? e.message : "Unknown error",
      type: typeof e.type === "string" ? e.type : (err instanceof Error ? err.constructor.name : "unknown"),
      code: typeof e.code === "string" ? e.code : undefined,
      stage,
    };
  }
  return {
    message: err instanceof Error ? err.message : "Unknown error",
    type: err instanceof Error ? err.constructor.name : "unknown",
    code: undefined,
    stage,
  };
}

async function processSuccessfulPayment(
  supabase: ReturnType<typeof createClient>,
  stripeClient: Stripe,
  paymentIntentId: string,
  jobId: string,
  customerId: string | undefined,
  tradieId: string | undefined,
  paymentType: string | undefined,
  amount: number
) {
  // Primary match: by stripe_payment_intent_id
  const { data: matchedTxn } = await supabase
    .from("transactions")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("type", "payment")
    .maybeSingle();

  if (matchedTxn) {
    await supabase
      .from("transactions")
      .update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("id", matchedTxn.id);
  } else {
    // Fallback: match by job_id + type + requires_payment status
    await supabase
      .from("transactions")
      .update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("type", "payment")
      .eq("status", "requires_payment")
      .order("created_at", { ascending: false })
      .limit(1);
  }

  // Fetch the job to calculate the new cumulative paid_amount
  const { data: jobForPaid } = await supabase
    .from("jobs")
    .select("agreed_quote_amount, paid_amount")
    .eq("id", jobId)
    .maybeSingle();

  const paymentAmount = amount / 100;
  const currentPaid = Number(jobForPaid?.paid_amount || 0);
  const agreedAmount = Number(jobForPaid?.agreed_quote_amount || 0);
  const newPaidAmount = Math.round((currentPaid + paymentAmount) * 100) / 100;

  const newPaymentStatus = newPaidAmount >= agreedAmount && agreedAmount > 0 ? "paid" : "partially_paid";

  await supabase
    .from("jobs")
    .update({
      payment_status: newPaymentStatus,
      paid_amount: newPaidAmount,
      stripe_payment_intent_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", jobId)
    .maybeSingle();

  const jobTitle = job?.title || "your job";

  const labelMap: Record<string, string> = {
    deposit: "50% deposit",
    remaining: "remaining balance",
    full: "full payment",
  };
  const paymentLabel = labelMap[paymentType || ""] || "payment";

  await supabase.rpc("log_job_activity", {
    p_job_id: jobId,
    p_activity_type: "payment_received",
    p_actor_id: customerId || null,
    p_detail: `${paymentLabel} of ${paymentAmount.toFixed(2)} received`,
    p_metadata: { amount: paymentAmount, payment_intent_id: paymentIntentId, payment_type: paymentType, cumulative_paid: newPaidAmount },
  });

  if (customerId) {
    await supabase.rpc("create_notification", {
      p_user_id: customerId,
      p_type: "payment_received",
      p_title: "Payment successful",
      p_body: `Your payment for the job "${jobTitle}" has been received.`,
      p_job_id: jobId,
    });
  }

  if (tradieId) {
    await supabase.rpc("create_notification", {
      p_user_id: tradieId,
      p_type: "payment_received",
      p_title: "Payment received",
      p_body: `The customer has paid for the job "${jobTitle}".`,
      p_job_id: jobId,
    });
  }

  // When the job is fully paid, create a payout transaction for the tradie
  if (newPaymentStatus === "paid" && tradieId) {
    // Check if a payout transaction already exists for this job to prevent duplicates
    const { data: existingPayout } = await supabase
      .from("transactions")
      .select("id")
      .eq("job_id", jobId)
      .eq("type", "payout")
      .maybeSingle();

    if (!existingPayout) {
      // Fetch the net amount from the payment transaction
      const { data: paymentTxn } = await supabase
        .from("transactions")
        .select("net_amount, platform_fee, gross_amount")
        .eq("job_id", jobId)
        .eq("type", "payment")
        .eq("status", "succeeded")
        .maybeSingle();

      if (paymentTxn) {
        // Destination charges auto-transfer funds to the connected account at charge time,
        // so the payout is already succeeded. For direct charges (no connected account
        // at payment time), the payout stays pending for manual release via process-payout.
        const { data: jobForTradie } = await supabase
          .from("jobs")
          .select("assigned_tradie_id")
          .eq("id", jobId)
          .maybeSingle();

        let payoutStatus = "payout_pending";
        let transferId = null;

        if (jobForTradie?.assigned_tradie_id) {
          const { data: tradieProfile } = await supabase
            .from("profiles")
            .select("stripe_account_id")
            .eq("id", jobForTradie.assigned_tradie_id)
            .maybeSingle();

          if (tradieProfile?.stripe_account_id) {
            payoutStatus = "payout_succeeded";
            transferId = `auto_destination_charge`;
          }
        }

        await supabase.from("transactions").insert({
          job_id: jobId,
          customer_id: customerId || null,
          tradie_id: tradieId,
          type: "payout",
          gross_amount: paymentTxn.net_amount,
          platform_fee: 0,
          net_amount: paymentTxn.net_amount,
          stripe_transfer_id: transferId,
          status: payoutStatus,
          metadata: {
            job_title: jobTitle,
            source_payment_txn: matchedTxn?.id || null,
            auto_transfer: payoutStatus === "payout_succeeded",
          },
        });

        if (payoutStatus === "payout_succeeded") {
          await supabase.rpc("log_job_activity", {
            p_job_id: jobId,
            p_activity_type: "payout_processed",
            p_actor_id: null,
            p_detail: `Payout of ${Number(paymentTxn.net_amount).toFixed(2)} transferred to tradie account`,
            p_metadata: { net_amount: paymentTxn.net_amount, auto_transfer: true },
          });
        }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let stage = "start";

  try {
    stage = "verify_signature";
    const sig = req.headers.get("stripe-signature");
    if (!sig || !STRIPE_WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Webhook signature missing or secret not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    switch (event.type) {
      case "checkout.session.completed": {
        stage = "handle_checkout_completed";
        const session = event.data.object as Stripe.Checkout.Session;
        const jobId = session.metadata?.job_id;
        const customerId = session.metadata?.customer_id;
        const tradieId = session.metadata?.tradie_id || undefined;
        const paymentType = session.metadata?.payment_type || "full";

        if (!jobId) break;

        const paymentIntentId = typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as Stripe.PaymentIntent | null)?.id || null;

        if (!paymentIntentId) break;

        // Retrieve the payment intent to get the actual amount
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status === "succeeded") {
          await processSuccessfulPayment(
            supabase,
            stripe,
            paymentIntentId,
            jobId,
            customerId,
            tradieId,
            paymentType,
            paymentIntent.amount
          );
        }

        break;
      }

      case "payment_intent.succeeded": {
        stage = "handle_payment_succeeded";
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const jobId = paymentIntent.metadata?.job_id;
        const customerId = paymentIntent.metadata?.customer_id;
        const tradieId = paymentIntent.metadata?.tradie_id || undefined;
        const paymentType = paymentIntent.metadata?.payment_type || "full";

        if (!jobId) break;

        // Check if this payment was already processed by checkout.session.completed
        const { data: existingTxn } = await supabase
          .from("transactions")
          .select("id, status")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "payment")
          .maybeSingle();

        if (existingTxn?.status === "succeeded") break;

        await processSuccessfulPayment(
          supabase,
          stripe,
          paymentIntent.id,
          jobId,
          customerId,
          tradieId,
          paymentType,
          paymentIntent.amount
        );

        break;
      }

      case "payment_intent.payment_failed": {
        stage = "handle_payment_failed";
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const jobId = paymentIntent.metadata?.job_id;
        const customerId = paymentIntent.metadata?.customer_id;

        if (!jobId) break;

        const failureReason = paymentIntent.last_payment_error?.message || "Payment failed";

        // Primary match: by stripe_payment_intent_id
        const { data: failedTxn } = await supabase
          .from("transactions")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "payment")
          .maybeSingle();

        if (failedTxn) {
          await supabase
            .from("transactions")
            .update({
              status: "failed",
              failure_reason: failureReason,
              updated_at: new Date().toISOString(),
            })
            .eq("id", failedTxn.id);
        } else {
          // Fallback: match by job_id
          await supabase
            .from("transactions")
            .update({
              status: "failed",
              failure_reason: failureReason,
              updated_at: new Date().toISOString(),
            })
            .eq("job_id", jobId)
            .eq("type", "payment")
            .eq("status", "requires_payment")
            .order("created_at", { ascending: false })
            .limit(1);
        }

        const { data: job } = await supabase
          .from("jobs")
          .select("title")
          .eq("id", jobId)
          .maybeSingle();

        const jobTitle = job?.title || "your job";

        await supabase.rpc("log_job_activity", {
          p_job_id: jobId,
          p_activity_type: "payment_failed",
          p_actor_id: customerId || null,
          p_detail: "Payment failed",
          p_metadata: { reason: failureReason, payment_intent_id: paymentIntent.id },
        });

        if (customerId) {
          await supabase.rpc("create_notification", {
            p_user_id: customerId,
            p_type: "payment_failed",
            p_title: "Payment failed",
            p_body: `Your payment for the job "${jobTitle}" could not be processed. Please try again.`,
            p_job_id: jobId,
          });
        }

        break;
      }

      case "charge.refunded": {
        stage = "handle_refund";
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;
        const refundAmount = charge.amount_refunded / 100;

        const { data: paymentTxn } = await supabase
          .from("transactions")
          .select("job_id, customer_id, tradie_id, gross_amount")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .eq("type", "payment")
          .maybeSingle();

        if (!paymentTxn) break;

        const isFullRefund = charge.amount_refunded >= charge.amount;

        await supabase
          .from("transactions")
          .update({
            status: isFullRefund ? "refunded" : "partially_refunded",
            stripe_refund_id: charge.refunds?.data[0]?.id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("job_id", paymentTxn.job_id)
          .eq("type", "refund")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);

        const { data: job } = await supabase
          .from("jobs")
          .select("title")
          .eq("id", paymentTxn.job_id)
          .maybeSingle();

        const jobTitle = job?.title || "your job";

        await supabase.rpc("log_job_activity", {
          p_job_id: paymentTxn.job_id,
          p_activity_type: "refund_processed",
          p_actor_id: null,
          p_detail: `Refund of $${refundAmount.toFixed(2)} processed`,
          p_metadata: { amount: refundAmount, full: isFullRefund },
        });

        await supabase.rpc("create_notification", {
          p_user_id: paymentTxn.customer_id,
          p_type: "refund_processed",
          p_title: "Refund processed",
          p_body: `A refund of $${refundAmount.toFixed(2)} has been processed for the job "${jobTitle}".`,
          p_job_id: paymentTxn.job_id,
        });

        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const diag = sanitizeError(err, stage);
    console.error("stripe-webhook error:", JSON.stringify(diag));

    return new Response(
      JSON.stringify({
        error: "Webhook processing failed",
        diagnostic: diag,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
