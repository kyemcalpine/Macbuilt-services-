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
      case "payment_intent.succeeded": {
        stage = "handle_payment_succeeded";
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const jobId = paymentIntent.metadata?.job_id;
        const customerId = paymentIntent.metadata?.customer_id;
        const tradieId = paymentIntent.metadata?.tradie_id || null;

        if (!jobId) break;

        await supabase
          .from("transactions")
          .update({ status: "succeeded", updated_at: new Date().toISOString() })
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "payment");

        await supabase
          .from("jobs")
          .update({ payment_status: "paid", updated_at: new Date().toISOString() })
          .eq("id", jobId);

        const { data: job } = await supabase
          .from("jobs")
          .select("title")
          .eq("id", jobId)
          .maybeSingle();

        const jobTitle = job?.title || "your job";

        await supabase.rpc("log_job_activity", {
          p_job_id: jobId,
          p_activity_type: "payment_received",
          p_actor_id: customerId,
          p_detail: `Payment of $${(paymentIntent.amount / 100).toFixed(2)} received`,
          p_metadata: { amount: paymentIntent.amount / 100, payment_intent_id: paymentIntent.id },
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

        break;
      }

      case "payment_intent.payment_failed": {
        stage = "handle_payment_failed";
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const jobId = paymentIntent.metadata?.job_id;
        const customerId = paymentIntent.metadata?.customer_id;

        if (!jobId) break;

        const failureReason = paymentIntent.last_payment_error?.message || "Payment failed";

        await supabase
          .from("transactions")
          .update({
            status: "failed",
            failure_reason: failureReason,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("type", "payment");

        const { data: job } = await supabase
          .from("jobs")
          .select("title")
          .eq("id", jobId)
          .maybeSingle();

        const jobTitle = job?.title || "your job";

        await supabase.rpc("log_job_activity", {
          p_job_id: jobId,
          p_activity_type: "payment_failed",
          p_actor_id: customerId,
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
