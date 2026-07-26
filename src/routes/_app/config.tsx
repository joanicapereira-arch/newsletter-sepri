import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getConfig, updateConfig, checkIsAdmin } from "@/lib/sources.functions";
import { sendTestAlertEmail } from "@/lib/scan.functions";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/config")({
  head: () => ({ meta: [{ title: "Configurações · SEPRI" }] }),
  component: ConfigPage,
});

function ConfigPage() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["config"], queryFn: () => getConfig() });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => checkIsAdmin() });
  const [form, setForm] = useState({ logo_url: "", disclaimer_html: "", alert_email: "" });

  useEffect(() => {
    if (cfg) setForm({ logo_url: cfg.logo_url, disclaimer_html: cfg.disclaimer_html, alert_email: cfg.alert_email });
  }, [cfg]);

  const save = useMutation({
    mutationFn: () => updateConfig({ data: form }),
    onSuccess: () => {
      toast.success("Configuração guardada");
      qc.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testEmail = useMutation({
    mutationFn: () => sendTestAlertEmail(),
    onSuccess: (r) => toast.success(`Email de teste enviado para ${r.to}. Verifica a caixa de entrada (e o spam).`),
    onError: (e: Error) =>
      toast.error(`Falha ao enviar: ${e.message}`, { duration: 8000 }),
  });

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aplica-se a todas as newsletters geradas a partir de agora.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branding e disclaimers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>URL do logótipo SEPRI</Label>
            <Input
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Aparecerá no topo de cada newsletter.
            </p>
          </div>
          <div>
            <Label>HTML do rodapé (disclaimers)</Label>
            <Textarea
              rows={5}
              value={form.disclaimer_html}
              onChange={(e) => setForm({ ...form, disclaimer_html: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>Email de alertas</Label>
            <Input
              type="email"
              value={form.alert_email}
              onChange={(e) => setForm({ ...form, alert_email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Recebe os alertas de novas deteções com botões de aprovar/rejeitar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Guardar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => testEmail.mutate()}
              disabled={testEmail.isPending}
            >
              <Mail className="w-4 h-4 mr-1" />
              {testEmail.isPending ? "A enviar…" : "Enviar email de teste"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Usa este botão para confirmar que a ligação ao Brevo está configurada, sem esperar
            por uma deteção real. Se falhar, a mensagem de erro indica exatamente o que falta
            configurar (ex: conector Brevo por ligar).
          </p>
        </CardContent>
      </Card>

      {me && (
        <Card>
          <CardHeader>
            <CardTitle>Sessão</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              ID: <code className="text-xs">{me.userId}</code>
            </p>
            <p className="text-sm mt-2">
              Papel: {me.isAdmin ? <strong className="text-primary">admin</strong> : "utilizador"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
