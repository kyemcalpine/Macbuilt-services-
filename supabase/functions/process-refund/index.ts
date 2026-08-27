import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Stripe from "npm:stripe@17.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

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

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    stage = "parse_body";
    const body = await req.json().catch(() => ({}));
    const jobId = body.jobId;

    stage = "fetch_pending_refunds";
    let query = serviceClient
      .from("transactions")
      .select(`
        id, job_id, customer_id, tradie_id, gross_amount, status, metadata,
        job:jobs!transactions_job_id_fkey ( id, title, stripe_payment_intent_id )
      `)
      .eq("type", "refund")
      .eq("status", "pending");

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data: pendingRefunds, error: refundError } = await query;

    if (refundError || !pendingRefunds) {
      const diag = sanitizeError(refundError || "No refunds returned", stage);
      console.error("process-refund fetch error:", JSON.stringify(diag));
      return new Response(JSON.stringify({
        error: "Could not fetch pending refunds",
        diagnostic: diag,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ transactionId: string; success: boolean; message: string }> = [];

    for (const txn of pendingRefunds) {
      const job = txn.job as any;
      const paymentIntentId = job?.stripe_payment_intent_id;

      if (!paymentIntentId) {
        results.push({
          transactionId: txn.id,
          success: false,
          message: "No Stripe payment intent found for this job",
        });
        continue;
      }

      try {
        stage = `create_refund_${txn.id}`;
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount: Math.round(txn.gross_amount * 100),
          metadata: {
            job_id: txn.job_id,
            transaction_id: txn.id,
            reason: txn.metadata?.reason || "cancellation",
          },
        });

        stage = `update_transaction_${txn.id}`;
        await serviceClient
          .from("transactions")
          .update({
            stripe_refund_id: refund.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", txn.id);

        results.push({
          transactionId: txn.id,
          success: true,
          message: `Refund of $${txn.gross_amount.toFixed(2)} initiated`,
        });
      } catch (refundErr: any) {
        console.error(`Refund failed for transaction ${txn.id}:`, refundErr);

        results.push({
          transactionId: txn.id,
          success: false,
          message: refundErr.message || "Refund failed",
        });
      }
    }

    return new Response(
      JSON.stringify({ results, total: results.length, succeeded: results.filter((r) => r.success).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const diag = sanitizeError(err, stage);
    console.error("process-refund error:", JSON.stringify(diag));

    return new Response(
      JSON.stringify({
        error: "Could not process refunds. Please try again.",
        diagnostic: diag,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
