import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScanFace, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Connexion — FacePresence" },
      { name: "description", content: "Connectez-vous à votre espace FacePresence." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: search.redirect ?? "/dashboard" });
    }
  }, [user, loading, navigate, search.redirect]);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* LEFT: brand panel */}
      <aside className="hidden flex-col justify-between p-12 text-primary-foreground gradient-hero lg:flex">
        <Link to="/" className="flex items-center gap-2 text-primary-foreground">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/15 backdrop-blur">
            <ScanFace className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold">FacePresence</span>
        </Link>
        <div>
          <h2 className="font-display text-4xl font-bold leading-tight">
            La présence en classe, vérifiée par l'IA.
          </h2>
          <p className="mt-4 text-primary-foreground/85">
            Reconnaissance faciale automatique, sessions Zoom intégrées et reporting en temps réel.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/70">© {new Date().getFullYear()} FacePresence</p>
      </aside>

      {/* RIGHT */}
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg gradient-hero text-primary-foreground">
                <ScanFace className="h-5 w-5" />
              </div>
              <span className="font-display text-lg font-bold">FacePresence</span>
            </Link>
          </div>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
            </TabsList>
            <TabsContent value="signin"><SignIn /></TabsContent>
            <TabsContent value="signup"><SignUp /></TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Connecté");
  }

  return (
    <Card className="mt-4 border-0 shadow-none">
      <CardHeader className="px-0">
        <CardTitle className="font-display text-2xl">Bon retour 👋</CardTitle>
        <CardDescription>Connectez-vous à votre espace.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd">Mot de passe</Label>
            <div className="relative">
              <Input
                id="pwd"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Se connecter
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [role, setRole] = useState<"student" | "teacher" | "parent">("student");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName, role },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Compte créé. Vous êtes connecté.");
  }

  return (
    <Card className="mt-4 border-0 shadow-none">
      <CardHeader className="px-0">
        <CardTitle className="font-display text-2xl">Créer votre compte</CardTitle>
        <CardDescription>Rejoignez FacePresence en quelques secondes.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom complet</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email2">E-mail</Label>
            <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd2">Mot de passe (min. 6)</Label>
            <div className="relative">
              <Input
                id="pwd2"
                type={showPwd ? "text" : "password"}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Je suis</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Élève</SelectItem>
                <SelectItem value="teacher">Enseignant</SelectItem>
                <SelectItem value="parent">Parent / Tuteur</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">L'accès Administrateur est attribué par un autre admin.</p>
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Créer mon compte
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
