import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, primaryRole, type AppRole } from "@/lib/auth";
import {
  ScanFace, LayoutDashboard, Calendar, GraduationCap, Users, UserCircle2,
  ClipboardList, LogOut, Camera, Settings, Plus, Bell, BarChart3, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CreateClassDialog } from "@/components/CreateClassDialog";
import { GlobalFaceCheckListener } from "@/components/GlobalFaceCheckListener";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["admin", "teacher", "student"] },
  { to: "/sessions", label: "Sessions", icon: Calendar, roles: ["admin", "teacher", "student"] },
  { to: "/classes", label: "Classes", icon: GraduationCap, roles: ["admin", "teacher", "student"] },
  { to: "/reports", label: "Rapports", icon: BarChart3, roles: ["admin", "teacher"] },
  { to: "/users", label: "Utilisateurs", icon: Users, roles: ["admin"] },
  { to: "/attendance", label: "Mes présences", icon: ClipboardList, roles: ["student"] },
  { to: "/parent", label: "Suivi de mes enfants", icon: ClipboardList, roles: ["parent"] },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/face-setup", label: "Profil facial", icon: Camera, roles: ["student"] },
  { to: "/integrations", label: "Intégrations API", icon: KeyRound, roles: ["admin"] },
  { to: "/settings", label: "Mon profil", icon: Settings },
];

function AuthLayout() {
  const { user, loading, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const router = useRouterState();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { redirect: router.location.pathname } });
    }
  }, [user, loading, navigate, router.location.pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  const role = primaryRole(roles);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(role) || (n.roles.includes("admin") && role === "admin"));
  const path = router.location.pathname;

  return (
    <div className="grid min-h-screen lg:grid-cols-[260px_1fr] bg-muted/30">
      {/* SIDEBAR */}
      <aside className="hidden flex-col border-r bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg gradient-hero text-primary-foreground">
            <ScanFace className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold">FacePresence</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((n) => {
            const Icon = n.icon;
            const active = path === n.to || path.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-md p-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="text-xs capitalize text-muted-foreground">{roleLabel(role)}</p>
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {(role === "admin" || role === "teacher") && (
              <CreateClassDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-center gap-1.5 text-xs h-9"
                  >
                    <Plus className="h-3.5 w-3.5" /> Créer classe
                  </Button>
                }
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "justify-start gap-2 text-muted-foreground h-9",
                (role === "admin" || role === "teacher") ? "flex-1 text-xs px-2 justify-center" : "w-full"
              )}
              onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}
            >
              <LogOut className="h-4 w-4" /> Se déconnecter
            </Button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-h-screen flex-col">
        {/* mobile header */}
        <header className="flex h-16 items-center justify-between border-b bg-background px-4 lg:hidden">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md gradient-hero text-primary-foreground">
              <ScanFace className="h-4 w-4" />
            </div>
            <span className="font-display font-bold">FacePresence</span>
          </Link>
          <div className="flex items-center gap-2">
            {(role === "admin" || role === "teacher") && (
              <CreateClassDialog
                trigger={
                  <Button variant="outline" size="sm" className="gap-1 text-xs h-8 px-2.5">
                    <Plus className="h-3 w-3" /> Créer classe
                  </Button>
                }
              />
            )}
            <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function roleLabel(role: AppRole) {
  return { admin: "Administrateur", teacher: "Enseignant", student: "Élève", parent: "Parent / Tuteur" }[role];
}
