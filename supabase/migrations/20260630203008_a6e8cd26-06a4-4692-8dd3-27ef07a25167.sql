
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Sources
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sources" ON public.sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Detections
CREATE TYPE public.detection_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  relevance_score INT NOT NULL DEFAULT 0,
  status detection_status NOT NULL DEFAULT 'pending',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX detections_status_idx ON public.detections (status, detected_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.detections TO authenticated;
GRANT ALL ON public.detections TO service_role;
ALTER TABLE public.detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage detections" ON public.detections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Newsletters
CREATE TABLE public.newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES public.detections(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX newsletters_detection_idx ON public.newsletters (detection_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletters TO authenticated;
GRANT ALL ON public.newsletters TO service_role;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage newsletters" ON public.newsletters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Approval tokens (HMAC validated server-side; table just for audit/revoke)
CREATE TABLE public.approval_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES public.detections(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.approval_tokens TO authenticated;
GRANT ALL ON public.approval_tokens TO service_role;
ALTER TABLE public.approval_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view tokens" ON public.approval_tokens
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Scan runs
CREATE TABLE public.scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sources_scanned INT NOT NULL DEFAULT 0,
  detections_created INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by TEXT NOT NULL DEFAULT 'cron'
);
GRANT SELECT, INSERT, UPDATE ON public.scan_runs TO authenticated;
GRANT ALL ON public.scan_runs TO service_role;
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view runs" ON public.scan_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- App config (single row)
CREATE TABLE public.app_config (
  id INT PRIMARY KEY DEFAULT 1,
  logo_url TEXT NOT NULL DEFAULT 'https://via.placeholder.com/200x60?text=SEPRI',
  disclaimer_html TEXT NOT NULL DEFAULT '<p style="font-size:11px;color:#888;">SEPRI Group — Medicina e Segurança no Trabalho. Esta comunicação é de carácter informativo. Para mais informações contacte os nossos serviços.</p>',
  alert_email TEXT NOT NULL DEFAULT 'joanicapereira@gmail.com',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_config_single_row CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage config" ON public.app_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_config (id) VALUES (1);

-- Seed sources
INSERT INTO public.sources (name, url, description, keywords) VALUES
  ('DGS', 'https://www.dgs.pt/destaques.aspx', 'Direção Geral de Saúde — guias e campanhas de saúde aplicáveis ao trabalho', ARRAY['medicina do trabalho','exames','químicos','gripe','calor','saúde laboral']),
  ('ACT', 'https://www.act.gov.pt/(pt-PT)/Itens/Noticias/Paginas/default.aspx', 'Autoridade para as Condições do Trabalho', ARRAY['segurança no trabalho','riscos psicossociais','relatório único','SST']),
  ('Diário da República', 'https://diariodarepublica.pt/dr/home', 'Filtrar alterações à Lei 102/2009, Código do Trabalho, medicina trabalho, autoproteção, legionella, formação', ARRAY['Lei 102/2009','Código do Trabalho','medicina do trabalho','autoproteção','legionella','formação']),
  ('EU-OSHA', 'https://osha.europa.eu/pt/highlights', 'Agência Europeia para a Segurança e Saúde no Trabalho', ARRAY['alterações climáticas','campanha europeia','diretrizes','SST']),
  ('ANEPC', 'https://www.prociv.pt/pt-pt/Paginas/default.aspx', 'Autoridade Nacional de Emergência e Proteção Civil — incêndios e autoproteção', ARRAY['incêndio','autoproteção','SCIE','medidas autoproteção']),
  ('Ordem dos Psicólogos', 'https://www.ordemdospsicologos.pt/pt/noticias', 'Apenas Psicologia do Trabalho e riscos psicossociais', ARRAY['psicologia do trabalho','riscos psicossociais']);
