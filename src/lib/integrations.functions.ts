import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Renvoie l'état (configuré ou non) des clés d'intégration externes.
 * Aucune valeur n'est jamais renvoyée au client — seulement un booléen.
 * Réservé aux administrateurs.
 */
export const getIntegrationsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRole) throw new Error("Accès réservé aux administrateurs");

    const present = (name: string) => !!process.env[name];

    return {
      zoom: {
        configured:
          present("ZOOM_ACCOUNT_ID") &&
          present("ZOOM_CLIENT_ID") &&
          present("ZOOM_CLIENT_SECRET"),
        keys: {
          ZOOM_ACCOUNT_ID: present("ZOOM_ACCOUNT_ID"),
          ZOOM_CLIENT_ID: present("ZOOM_CLIENT_ID"),
          ZOOM_CLIENT_SECRET: present("ZOOM_CLIENT_SECRET"),
        },
      },
      aws: {
        configured:
          present("AWS_ACCESS_KEY_ID") &&
          present("AWS_SECRET_ACCESS_KEY") &&
          present("AWS_REGION"),
        keys: {
          AWS_ACCESS_KEY_ID: present("AWS_ACCESS_KEY_ID"),
          AWS_SECRET_ACCESS_KEY: present("AWS_SECRET_ACCESS_KEY"),
          AWS_REGION: present("AWS_REGION"),
          AWS_REKOGNITION_COLLECTION: present("AWS_REKOGNITION_COLLECTION"),
        },
      },
    };
  });
