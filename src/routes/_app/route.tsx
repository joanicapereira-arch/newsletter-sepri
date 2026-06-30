import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Inbox, FileText, Globe, History, Settings } from "lucide-react";

export const Route = createFileRoute("/_app")({
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
  const { location } = useRouterState();

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
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
