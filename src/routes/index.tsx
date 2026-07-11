import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanFace, ShieldCheck, Users, Video, Clock, BarChart3, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FacePresence — Présences par reconnaissance faciale pour cours en ligne" },
      { name: "description", content: "Une plateforme intégrée pour créer des sessions Zoom et vérifier automatiquement la présence des élèves grâce à la reconnaissance faciale." },
      { property: "og:title", content: "FacePresence — Présences par reconnaissance faciale pour cours en ligne" },
      { property: "og:description", content: "Une plateforme intégrée pour créer des sessions Zoom et vérifier automatiquement la présence des élèves grâce à la reconnaissance faciale." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <header className="border-b border-border/60 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-hero text-primary-foreground shadow-elev">
              <ScanFace className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">FacePresence</span>
          </Link>
          <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Fonctionnalités</a>
            <a href="#workflow" className="hover:text-foreground">Comment ça marche</a>
            <a href="#actors" className="hover:text-foreground">Pour qui</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Se connecter</Button></Link>
            <Link to="/auth"><Button size="sm">Commencer</Button></Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 gradient-soft" />
        <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-xs font-medium text-accent-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Reconnaissance faciale · AWS Rekognition · Zoom
            </span>
            <h1 className="mt-6 font-display text-5xl font-bold leading-tight tracking-tight md:text-6xl">
              La présence en classe en ligne,{" "}
              <span className="text-gradient">vérifiée automatiquement.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              FacePresence combine la création de sessions de cours en ligne et la reconnaissance faciale
              automatique pour garantir la fiabilité, la rapidité et la traçabilité du suivi de présence
              dans votre établissement.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="gap-2">
                  Démarrer gratuitement <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline">Voir les fonctionnalités</Button>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              {[
                "Identification sans faille",
                "Détection des départs prématurés",
                "Export des présences",
              ].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Tout ce qu'il faut pour fiabiliser vos présences</h2>
          <p className="mt-3 text-muted-foreground">Une réponse concrète aux limites des appels manuels et des feuilles papier.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Video, title: "Sessions Zoom intégrées", desc: "Créez vos cours en ligne et générez les liens d'accès en un clic depuis la plateforme." },
            { icon: ScanFace, title: "Reconnaissance faciale", desc: "Identification automatique à la connexion via AWS Rekognition, avec score de confiance." },
            { icon: Clock, title: "Détection de présence partielle", desc: "Suivi de la connexion et de la déconnexion pour distinguer présence complète et partielle." },
            { icon: ShieldCheck, title: "Anti-usurpation", desc: "Plus de cas où un élève se connecte à la place d'un autre — l'identité est vérifiée." },
            { icon: BarChart3, title: "Tableaux de bord", desc: "Consultation, filtrage et export des données de présence pour l'administration." },
            { icon: Users, title: "Suivi parental", desc: "Les parents reçoivent et consultent les présences de leur enfant en toute transparence." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group rounded-xl border bg-card p-6 shadow-soft transition hover:shadow-elev">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="workflow" className="border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold md:text-4xl">Comment ça marche</h2>
            <p className="mt-3 text-muted-foreground">Quatre étapes simples, de l'inscription au rapport.</p>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              ["1", "Profil facial", "L'élève enregistre une photo de référence indexée par AWS Rekognition."],
              ["2", "Session créée", "L'enseignant programme un cours et la session Zoom est générée."],
              ["3", "Vérification à l'entrée", "À la connexion, la webcam capture une image comparée au profil."],
              ["4", "Rapport en direct", "Les présences sont enregistrées et accessibles à l'administration."],
            ].map(([n, t, d]) => (
              <li key={n} className="rounded-xl bg-card p-6 shadow-soft">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full gradient-hero text-sm font-bold text-primary-foreground">{n}</div>
                <h3 className="font-display font-semibold">{t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ACTORS */}
      <section id="actors" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Une expérience adaptée à chaque acteur</h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "Administration", desc: "Gestion globale des élèves, classes, enseignants et reporting." },
            { title: "Enseignant", desc: "Création de sessions, supervision et correction manuelle si besoin." },
            { title: "Élève", desc: "Connexion simplifiée — la vérification se fait de façon transparente." },
            { title: "Parent / Tuteur", desc: "Consultation du suivi de présence de son enfant." },
          ].map((a) => (
            <div key={a.title} className="rounded-xl border bg-card p-6 shadow-soft">
              <h3 className="font-display text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="overflow-hidden rounded-2xl gradient-hero p-10 text-center text-primary-foreground shadow-elev">
          <h2 className="font-display text-3xl font-bold md:text-4xl">Modernisez la gestion des présences dès aujourd'hui</h2>
          <p className="mt-3 text-primary-foreground/90">Rejoignez les établissements qui automatisent leur suivi pédagogique.</p>
          <div className="mt-6">
            <Link to="/auth">
              <Button size="lg" variant="secondary" className="gap-2">
                Créer mon compte <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} FacePresence — Sénégal
      </footer>
    </div>
  );
}
