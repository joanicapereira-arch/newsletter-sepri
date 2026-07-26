ALTER TABLE public.detections ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.detections ALTER COLUMN status TYPE text USING status::text;
UPDATE public.detections SET status = 'informativo' WHERE status = 'approved';
DROP TYPE public.detection_status;
CREATE TYPE public.detection_status AS ENUM ('pending','informativo','prioritario','rejected');
ALTER TABLE public.detections ALTER COLUMN status TYPE public.detection_status USING status::public.detection_status;
ALTER TABLE public.detections ALTER COLUMN status SET DEFAULT 'pending'::public.detection_status;