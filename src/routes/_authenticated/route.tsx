import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Inbox, FileText, Globe, History, Settings, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const { redirect } = await import("@tanstack/react-router");
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: Layout,
});

const navItems = [
  { to: "/inbox", label: "Caixa de entrada", icon: Inbox },
  { to: "/newsletters", label: "Newsletters", icon: FileText },
  { to: "/sources", label: "Fontes", icon: Globe },
  { to: "/history", label: "Histórico de scans", icon: History },
  { to: "/config", label: "Configurações", icon: Settings },
] as const;

function Layout() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold">
              S
            </div>
            <div>
              <div className="font-semibold leading-tight">SEPRI</div>
              <div className="text-xs text-muted-foreground">Newsletter Bot</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          {email && <div className="text-xs text-muted-foreground px-2 mb-2 truncate">{email}</div>}
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
