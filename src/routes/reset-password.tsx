import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Réinitialiser le mot de passe — FacePresence" },
      { name: "description", content: "Définissez un nouveau mot de passe pour votre compte FacePresence." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase places the recovery token in the URL hash and creates a session
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Mot de passe trop court (min. 6 caractères)");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mot de passe mis à jour");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Nouveau mot de passe</CardTitle>
          <CardDescription>
            {ready
              ? "Choisissez un nouveau mot de passe pour votre compte."
              : "Vérification du lien de réinitialisation…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pwd">Nouveau mot de passe</Label>
              <Input id="pwd" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={!ready} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pwd2">Confirmer</Label>
              <Input id="pwd2" type="password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={!ready} />
            </div>
            <Button type="submit" disabled={busy || !ready} className="w-full">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Mettre à jour
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
