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

const STRIPE_V2_VERSION = "2026-08-26.preview";

async function stripeV2Get(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v2/${path}`, {
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_V2_VERSION,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const errMsg = (data as Record<string, unknown>)?.error
      ? ((data as Record<string, unknown>).error as Record<string, unknown>)?.message
      : `Stripe V2 API error: ${response.status}`;
    throw new Error(typeof errMsg === "string" ? errMsg : `Stripe V2 API error: ${response.status}`);
  }
  return data as Record<string, unknown>;
}

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

    const userId = userData.user.id;

    stage = "fetch_profile";
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_account_id, role, verification_status")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.stripe_account_id) {
      return new Response(
        JSON.stringify({ connected: false, chargesEnabled: false, payoutsEnabled: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    stage = "retrieve_account_v2";
    const account = await stripeV2Get(`core/accounts/${profile.stripe_account_id}?include[]=configuration.merchant.capabilities&include[]=configuration.recipient.capabilities`);

    const merchantConfig = (account.configuration as Record<string, unknown>)?.merchant as Record<string, unknown> | undefined;
    const merchantCaps = merchantConfig?.capabilities as Record<string, Record<string, unknown>> | undefined;
    const cardPaymentsStatus = merchantCaps?.card_payments?.status as string | undefined;
    const stripeBalancePayouts = merchantCaps?.stripe_balance as Record<string, Record<string, unknown>> | undefined;
    const payoutsStatus = stripeBalancePayouts?.payouts?.status as string | undefined;

    const recipientConfig = (account.configuration as Record<string, unknown>)?.recipient as Record<string, unknown> | undefined;
    const recipientCaps = recipientConfig?.capabilities as Record<string, Record<string, unknown>> | undefined;
    const recipientStripeBalance = recipientCaps?.stripe_balance as Record<string, Record<string, unknown>> | undefined;
    const transfersStatus = recipientStripeBalance?.stripe_transfers?.status as string | undefined;

    const chargesEnabled = cardPaymentsStatus === "active";
    const payoutsEnabled = payoutsStatus === "active" || transfersStatus === "active";
    const detailsSubmitted = account.onboarding_completed as boolean | undefined;

    return new Response(
      JSON.stringify({
        connected: true,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted: detailsSubmitted ?? false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const diag = sanitizeError(err, stage);
    console.error("tradie-account-status error:", JSON.stringify(diag));

    return new Response(
      JSON.stringify({
        error: "Could not check payout status. Please try again.",
        diagnostic: diag,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
