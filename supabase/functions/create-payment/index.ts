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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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

    const userId = userData.user.id;

    const body = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Job ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the job — RLS ensures only the owner can see it
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, customer_id, status, payment_status, agreed_quote_amount, assigned_tradie_id, title")
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

    if (job.status !== "assigned") {
      return new Response(JSON.stringify({ error: "Payment is only available for assigned jobs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.payment_status !== "unpaid") {
      return new Response(JSON.stringify({ error: "This job has already been paid" }), {
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

    // Use the service role to write the transaction and update the job
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const origin = req.headers.get("origin") || req.headers.get("referer") || Deno.env.get("APP_URL") || Deno.env.get("SUPABASE_URL") || "";
    const amountInCents = Math.round(job.agreed_quote_amount * 100);

    // Create a Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `Job: ${job.title}`,
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
      },
    });

    // Create a transaction record
    const platformFee = Math.round(job.agreed_quote_amount * 0.035 * 100) / 100;
    const netAmount = job.agreed_quote_amount - platformFee;

    await serviceClient.from("transactions").insert({
      job_id: job.id,
      customer_id: userId,
      tradie_id: job.assigned_tradie_id,
      type: "payment",
      gross_amount: job.agreed_quote_amount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_intent_id: session.payment_intent as string,
      status: "requires_payment",
      metadata: { job_title: job.title, checkout_session_id: session.id },
    });

    // Store the payment intent ID on the job
    await serviceClient
      .from("jobs")
      .update({
        stripe_payment_intent_id: session.payment_intent as string,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    // Log activity
    await serviceClient.rpc("log_job_activity", {
      p_job_id: job.id,
      p_activity_type: "payment_initiated",
      p_actor_id: userId,
      p_detail: "Payment initiated",
      p_metadata: { amount: job.agreed_quote_amount, checkout_session_id: session.id },
    });

    // Notify the tradie
    if (job.assigned_tradie_id) {
      await serviceClient.rpc("create_notification", {
        p_user_id: job.assigned_tradie_id,
        p_type: "payment_required",
        p_title: "Payment in progress",
        p_body: `The customer is making a payment for the job "${job.title}".`,
        p_job_id: job.id,
      });
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payment error:", err);
    return new Response(
      JSON.stringify({ error: "Could not initiate payment. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
