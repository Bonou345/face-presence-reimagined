import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIntegrationsStatus } from "@/lib/integrations.functions";
import { useAuth, primaryRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, ExternalLink, Video, Camera, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Intégrations — FacePresence" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const fetchStatus = useServerFn(getIntegrationsStatus);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["integrations-status"],
    queryFn: () => fetchStatus(),
    enabled: role === "admin",
    retry: false,
  });

  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center">
        <h1 className="font-display text-2xl font-bold">Accès restreint</h1>
        <p className="mt-2 text-muted-foreground">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Intégrations & clés API</h1>
        <p className="mt-1 text-muted-foreground">
          Configurez les services externes nécessaires au fonctionnement de FacePresence.
          Les clés sont stockées de manière chiffrée côté serveur — jamais exposées au navigateur.
        </p>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <IntegrationCard
            icon={<Video className="h-5 w-5" />}
            title="Zoom (création de meetings)"
            description="Permet de générer automatiquement le lien Zoom de chaque session via OAuth Server-to-Server."
            configured={data.zoom.configured}
            keys={data.zoom.keys}
            docsUrl="https://marketplace.zoom.us/docs/guides/build/server-to-server-oauth-app/"
            instructions={
              <>
                <li>Créez une app <strong>Server-to-Server OAuth</strong> sur Zoom Marketplace.</li>
                <li>Activez les scopes <code>meeting:write:admin</code> et <code>meeting:read:admin</code>.</li>
                <li>Copiez l'Account ID, le Client ID et le Client Secret dans les secrets.</li>
              </>
            }
          />

          <IntegrationCard
            icon={<Camera className="h-5 w-5" />}
            title="AWS Rekognition (reconnaissance faciale)"
            description="Indexe les visages de référence et compare les captures webcam pour valider la présence."
            configured={data.aws.configured}
            keys={data.aws.keys}
            docsUrl="https://docs.aws.amazon.com/rekognition/latest/dg/collections.html"
            instructions={
              <>
                <li>Créez un utilisateur IAM avec la politique <code>AmazonRekognitionFullAccess</code>.</li>
                <li>Générez une <strong>Access Key</strong> et notez la <strong>Region</strong> (ex: <code>eu-west-1</code>).</li>
                <li>Le nom de la collection est optionnel (par défaut <code>classconnect-faces</code>).</li>
              </>
            }
          />

          <Card className="border-dashed">
            <CardContent className="flex items-start gap-3 p-6">
              <KeyRound className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                <p className="font-medium">Comment ajouter / modifier les clés ?</p>
                <p className="mt-1 text-muted-foreground">
                  Demandez à l'assistant Lovable « ajoute les clés Zoom » ou « configure AWS Rekognition ».
                  Un formulaire sécurisé s'ouvrira pour saisir les valeurs sans qu'elles transitent par le chat.
                  Vous pouvez aussi gérer les secrets dans <em>Paramètres du projet → Secrets</em>.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                  Rafraîchir l'état
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function IntegrationCard(props: {
  icon: React.ReactNode;
  title: string;
  description: string;
  configured: boolean;
  keys: Record<string, boolean>;
  docsUrl: string;
  instructions: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-primary-soft p-2 text-primary">{props.icon}</div>
            <div>
              <CardTitle className="font-display">{props.title}</CardTitle>
              <CardDescription className="mt-1">{props.description}</CardDescription>
            </div>
          </div>
          {props.configured ? (
            <Badge className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Configuré</Badge>
          ) : (
            <Badge variant="destructive" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Non configuré</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">État des clés</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {Object.entries(props.keys).map(([k, ok]) => (
              <div key={k} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
                <code className="font-mono">{k}</code>
                {ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comment obtenir les clés</p>
          <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">{props.instructions}</ol>
          <a
            href={props.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Documentation officielle <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
