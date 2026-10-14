BEGIN;
-- Only the addressee may read messages. No direct insert/update/delete is granted.
GRANT SELECT ON public.platform_messages TO authenticated;
CREATE POLICY platform_messages_recipient_select
ON public.platform_messages FOR SELECT TO authenticated
USING (user_id=auth.uid());
DO $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
   AND schemaname='public' AND tablename='platform_messages')
 THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_messages;
 END IF;
END
$f$;
COMMIT;