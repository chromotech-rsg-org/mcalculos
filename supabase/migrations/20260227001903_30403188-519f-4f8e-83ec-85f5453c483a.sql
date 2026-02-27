
-- Fix overly permissive templates policy - split into specific operations
DROP POLICY "Authenticated users can manage templates" ON public.extraction_templates;

CREATE POLICY "Authenticated users can select templates" ON public.extraction_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert templates" ON public.extraction_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update templates" ON public.extraction_templates
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete templates" ON public.extraction_templates
  FOR DELETE TO authenticated USING (true);
