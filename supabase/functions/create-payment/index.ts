import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@17.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is not configured");
}

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

type PaymentType = "full" | "deposit" | "remaining";

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
  let jobId: string | null = null;
  let userId: string | null = null;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    stage = "auth";
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    userId = userData.user.id;

    stage = "parse_body";
    const body = await req.json();
    jobId = body.jobId;
    const paymentType: PaymentType = body.paymentType || "full";

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Job ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["full", "deposit", "remaining"].includes(paymentType)) {
      return new Response(JSON.stringify({ error: "Invalid payment type. Must be 'full', 'deposit', or 'remaining'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    stage = "fetch_job";
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, customer_id, status, payment_status, agreed_quote_amount, paid_amount, assigned_tradie_id, title, deposit_requested_at")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.customer_id !== userId) {
      return new Response(JSON.stringify({ error: "Only the job owner can make a payment" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow payment at any status except cancelled
    if (job.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Cannot pay for a cancelled job" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "This job has already been paid in full" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.payment_status === "disputed") {
      return new Response(JSON.stringify({ error: "Cannot pay while a dispute is open on this job" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!job.agreed_quote_amount || job.agreed_quote_amount <= 0) {
      return new Response(JSON.stringify({ error: "No agreed quote amount found for this job" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate the payment amount based on type
    const agreedAmount = Number(job.agreed_quote_amount);
    const paidSoFar = Number(job.paid_amount || 0);
    let paymentAmount: number;

    if (paymentType === "deposit") {
      paymentAmount = Math.round(agreedAmount * 0.50 * 100) / 100;
    } else if (paymentType === "remaining") {
      paymentAmount = Math.round((agreedAmount - paidSoFar) * 100) / 100;
      if (paymentAmount <= 0) {
        return new Response(JSON.stringify({ error: "There is no remaining balance to pay" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // full
      paymentAmount = Math.round((agreedAmount - paidSoFar) * 100) / 100;
      if (paymentAmount <= 0) {
        return new Response(JSON.stringify({ error: "This job has already been paid in full" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rawOrigin = req.headers.get("origin") || req.headers.get("referer") || "";
    const origin = rawOrigin ? new URL(rawOrigin).origin : "";
    if (!origin) {
      return new Response(JSON.stringify({ error: "Could not determine redirect URL. Please refresh the page and try again." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountInCents = Math.round(paymentAmount * 100);

    const labelMap: Record<PaymentType, string> = {
      deposit: "50% Deposit",
      remaining: "Remaining Balance",
      full: "Full Payment",
    };

    stage = "create_checkout";
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `${labelMap[paymentType]}: ${job.title}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/jobs/${job.id}?payment=success`,
      cancel_url: `${origin}/jobs/${job.id}?payment=cancelled`,
      metadata: {
        job_id: job.id,
        customer_id: userId,
        tradie_id: job.assigned_tradie_id || "",
        payment_type: paymentType,
      },
    });

    const platformFee = Math.round(paymentAmount * 0.035 * 100) / 100;
    const netAmount = paymentAmount - platformFee;

    stage = "insert_transaction";
    await serviceClient.from("transactions").insert({
      job_id: job.id,
      customer_id: userId,
      tradie_id: job.assigned_tradie_id,
      type: "payment",
      gross_amount: paymentAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_intent_id: session.payment_intent as string,
      status: "requires_payment",
      metadata: {
        job_title: job.title,
        checkout_session_id: session.id,
        payment_type: paymentType,
        agreed_quote_amount: agreedAmount,
      },
    });

    stage = "update_job";
    await serviceClient
      .from("jobs")
      .update({
        stripe_payment_intent_id: session.payment_intent as string,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    stage = "log_activity";
    await serviceClient.rpc("log_job_activity", {
      p_job_id: job.id,
      p_activity_type: "payment_initiated",
      p_actor_id: userId,
      p_detail: `${labelMap[paymentType]} of $${paymentAmount.toFixed(2)} initiated`,
      p_metadata: { amount: paymentAmount, payment_type: paymentType, checkout_session_id: session.id },
    });

    stage = "notify_tradie";
    if (job.assigned_tradie_id) {
      await serviceClient.rpc("create_notification", {
        p_user_id: job.assigned_tradie_id,
        p_type: "payment_required",
        p_title: "Payment in progress",
        p_body: `The customer is making a ${labelMap[paymentType].toLowerCase()} for the job "${job.title}".`,
        p_job_id: job.id,
      });
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const diag = sanitizeError(err, stage);
    console.error("create-payment error:", JSON.stringify(diag));

    if (jobId) {
      try {
        await serviceClient.rpc("log_job_activity", {
          p_job_id: jobId,
          p_activity_type: "payment_failed",
          p_actor_id: userId,
          p_detail: `Payment failed at ${diag.stage}`,
          p_metadata: diag,
        });
      } catch {
        // best-effort — don't mask the original error
      }
    }

    return new Response(
      JSON.stringify({
        error: "Could not initiate payment. Please try again.",
        diagnostic: diag,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
