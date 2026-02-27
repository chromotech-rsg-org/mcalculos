import { supabase } from '@/integrations/supabase/client';
import { Document, DocumentFile, ExtractionTemplate } from '@/types';

// Documents
export const getDocuments = async (userId?: string): Promise<Document[]> => {
  let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching documents:', error);
    return [];
  }
  return (data || []).map(mapDocFromDb);
};

export const getDocumentById = async (docId: string): Promise<Document | null> => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', docId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDocFromDb(data);
};

export const saveDocument = async (doc: Document): Promise<void> => {
  const dbDoc = {
    id: doc.id,
    user_id: doc.user_id,
    name: doc.name,
    description: doc.description,
    payslip_pattern: doc.payslip_pattern,
    template_id: doc.template_id,
    files: doc.files as any,
    extracted_data: doc.extracted_data as any,
    status: doc.status,
  };

  const { error } = await supabase
    .from('documents')
    .upsert(dbDoc, { onConflict: 'id' });
  
  if (error) console.error('Error saving document:', error);
};

export const deleteDocument = async (docId: string): Promise<void> => {
  const { error } = await supabase.from('documents').delete().eq('id', docId);
  if (error) console.error('Error deleting document:', error);
};

// Templates
export const getTemplates = async (): Promise<ExtractionTemplate[]> => {
  const { data, error } = await supabase
    .from('extraction_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
  return (data || []).map(t => ({
    id: t.id,
    name: t.name,
    field_mappings: t.field_mappings as any || [],
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));
};

export const saveTemplate = async (template: ExtractionTemplate): Promise<void> => {
  const { error } = await supabase
    .from('extraction_templates')
    .upsert({
      id: template.id,
      name: template.name,
      field_mappings: template.field_mappings as any,
    }, { onConflict: 'id' });
  if (error) console.error('Error saving template:', error);
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  const { error } = await supabase.from('extraction_templates').delete().eq('id', templateId);
  if (error) console.error('Error deleting template:', error);
};

export const getTemplateById = async (templateId: string): Promise<ExtractionTemplate | null> => {
  const { data, error } = await supabase
    .from('extraction_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    field_mappings: data.field_mappings as any || [],
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
};

// Generate unique ID
export const generateId = (): string => {
  return crypto.randomUUID();
};

// Helper to map DB row to Document type
function mapDocFromDb(data: any): Document {
  return {
    id: data.id,
    user_id: data.user_id,
    name: data.name,
    description: data.description || '',
    payslip_pattern: data.payslip_pattern,
    template_id: data.template_id,
    files: (data.files || []) as DocumentFile[],
    extracted_data: data.extracted_data as any,
    status: data.status || 'pending',
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
