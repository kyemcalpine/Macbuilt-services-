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
if (STRIPE_SECRET_KEY && !STRIPE_SECRET_KEY.startsWith("sk_")) {
  console.error("STRIPE_SECRET_KEY has an invalid prefix. Expected sk_test_ or sk_live_, got: " + STRIPE_SECRET_KEY.substring(0, 8) + "...");
}

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const STRIPE_V2_VERSION = "2026-08-26.preview";

async function stripeV2Post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v2/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Stripe-Version": STRIPE_V2_VERSION,
    },
    body: JSON.stringify(body),
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
    stage = "validate_stripe_key";
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe is not configured. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!STRIPE_SECRET_KEY.startsWith("sk_")) {
      return new Response(JSON.stringify({
        error: "Stripe secret key is invalid. It must start with sk_test_ or sk_live_. Please update the STRIPE_SECRET_KEY edge function secret.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      .select("id, role, verification_status, stripe_account_id, email, full_name, business_name")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.role !== "tradie") {
      return new Response(JSON.stringify({ error: "Only tradies can set up payouts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.verification_status !== "approved") {
      return new Response(JSON.stringify({ error: "Your account must be approved before setting up payouts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let accountId = profile.stripe_account_id;

    stage = "create_account_v2";
    if (!accountId) {
      const account = await stripeV2Post("core/accounts", {
        contact_email: profile.email || undefined,
        display_name: profile.business_name || profile.full_name || undefined,
        dashboard: "express",
        identity: {
          country: "AU",
          entity_type: "company",
        },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
            },
          },
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true },
              },
            },
          },
        },
        defaults: {
          responsibilities: {
            fees_collector: "stripe",
            losses_collector: "stripe",
          },
        },
        metadata: {
          user_id: userId,
          full_name: profile.full_name || "",
          business_name: profile.business_name || "",
        },
      });

      accountId = account.id as string;

      stage = "save_account_id";
      await serviceClient
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", userId);
    }

    stage = "create_onboarding_link_v2";
    const origin = req.headers.get("origin") || req.headers.get("referer") || "https://example.com";
    const accountLink = await stripeV2Post("core/account_links", {
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "recipient"],
          refresh_url: `${origin}/#/profile?stripe_refresh=true`,
          return_url: `${origin}/#/profile?stripe_return=true`,
        },
      },
    });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const diag = sanitizeError(err, stage);
    console.error("create-tradie-account error:", JSON.stringify(diag));

    return new Response(
      JSON.stringify({
        error: "Could not start payout setup. Please try again.",
        diagnostic: diag,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
