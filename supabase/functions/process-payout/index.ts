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

    stage = "fetch_pending_payouts";
    let query = serviceClient
      .from("transactions")
      .select(`
        id, job_id, customer_id, tradie_id, gross_amount, platform_fee, net_amount,
        status, metadata,
        job:jobs!transactions_job_id_fkey ( id, title, customer_confirmed_at, assigned_tradie_id ),
        tradie:profiles!transactions_tradie_id_fkey ( id, stripe_account_id, email, full_name, business_name )
      `)
      .eq("type", "payout")
      .eq("status", "payout_pending");

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data: pendingPayouts, error: payoutError } = await query;

    if (payoutError || !pendingPayouts) {
      const diag = sanitizeError(payoutError || "No payouts returned", stage);
      console.error("process-payout fetch error:", JSON.stringify(diag));
      return new Response(JSON.stringify({
        error: "Could not fetch pending payouts",
        diagnostic: diag,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ transactionId: string; success: boolean; message: string }> = [];

    for (const txn of pendingPayouts) {
      const tradie = txn.tradie as any;

      if (!tradie || !tradie.stripe_account_id) {
        results.push({
          transactionId: txn.id,
          success: false,
          message: "Tradie has not connected a Stripe account",
        });

        await serviceClient
          .from("transactions")
          .update({
            status: "payout_failed",
            failure_reason: "Tradie has not connected a Stripe account",
            updated_at: new Date().toISOString(),
          })
          .eq("id", txn.id);
        continue;
      }

      try {
        stage = `retrieve_account_${txn.id}`;
        const account = await stripe.accounts.retrieve(tradie.stripe_account_id);

        if (!account.charges_enabled || !account.payouts_enabled) {
          results.push({
            transactionId: txn.id,
            success: false,
            message: "Tradie's Stripe account is not fully onboarded",
          });

          await serviceClient
            .from("transactions")
            .update({
              status: "payout_failed",
              failure_reason: "Tradie's Stripe account is not fully onboarded",
              updated_at: new Date().toISOString(),
            })
            .eq("id", txn.id);
          continue;
        }

        stage = `create_transfer_${txn.id}`;
        const transfer = await stripe.transfers.create({
          amount: Math.round(txn.net_amount * 100),
          currency: "aud",
          destination: tradie.stripe_account_id,
          metadata: {
            job_id: txn.job_id,
            transaction_id: txn.id,
            tradie_id: txn.tradie_id,
          },
        });

        stage = `update_transaction_${txn.id}`;
        await serviceClient
          .from("transactions")
          .update({
            status: "payout_succeeded",
            stripe_transfer_id: transfer.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", txn.id);

        stage = `log_activity_${txn.id}`;
        const job = txn.job as any;
        const jobTitle = job?.title || "a job";

        await serviceClient.rpc("log_job_activity", {
          p_job_id: txn.job_id,
          p_activity_type: "payout_processed",
          p_actor_id: null,
          p_detail: `Payout of $${txn.net_amount.toFixed(2)} processed`,
          p_metadata: { transfer_id: transfer.id, net_amount: txn.net_amount },
        });

        stage = `notify_tradie_${txn.id}`;
        if (txn.tradie_id) {
          await serviceClient.rpc("create_notification", {
            p_user_id: txn.tradie_id,
            p_type: "payout_processed",
            p_title: "Payout sent",
            p_body: `A payout of $${txn.net_amount.toFixed(2)} has been sent to your account for the job "${jobTitle}".`,
            p_job_id: txn.job_id,
          });
        }

        results.push({
          transactionId: txn.id,
          success: true,
          message: `Payout of $${txn.net_amount.toFixed(2)} transferred`,
        });
      } catch (transferErr: any) {
        console.error(`Payout failed for transaction ${txn.id}:`, transferErr);

        await serviceClient
          .from("transactions")
          .update({
            status: "payout_failed",
            failure_reason: transferErr.message || "Transfer failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", txn.id);

        results.push({
          transactionId: txn.id,
          success: false,
          message: transferErr.message || "Transfer failed",
        });
      }
    }

    return new Response(
      JSON.stringify({ results, total: results.length, succeeded: results.filter((r) => r.success).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const diag = sanitizeError(err, stage);
    console.error("process-payout error:", JSON.stringify(diag));

    return new Response(
      JSON.stringify({
        error: "Could not process payouts. Please try again.",
        diagnostic: diag,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
