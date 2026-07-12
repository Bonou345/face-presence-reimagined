import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const linkChildByMatricule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ matricule: z.string().trim().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isParent } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "parent",
    });
    if (!isParent) throw new Error("Seuls les parents peuvent rattacher un enfant");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student, error: sErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, student_number")
      .eq("student_number", data.matricule)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!student) throw new Error("Aucun élève trouvé avec ce matricule");

    const { data: isStudent } = await supabaseAdmin.rpc("has_role", {
      _user_id: student.id,
      _role: "student",
    });
    if (!isStudent) throw new Error("Ce compte n'est pas un élève");

    const { data: existing } = await supabaseAdmin
      .from("parent_links")
      .select("id")
      .eq("parent_id", userId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (existing) throw new Error("Cet enfant est déjà rattaché à votre compte");

    const { error: iErr } = await supabaseAdmin
      .from("parent_links")
      .insert({ parent_id: userId, student_id: student.id });
    if (iErr) throw new Error(iErr.message);

    return {
      ok: true,
      student: {
        id: student.id,
        full_name: student.full_name,
        email: student.email,
      },
    };
  });
