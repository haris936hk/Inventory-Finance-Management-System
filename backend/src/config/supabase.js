// ========== src/config/supabase.js ==========
const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

class SupabaseStorage {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.buckets = {
      documents: 'documents',
      imports: 'imports',
      exports: 'exports',
      receipts: 'receipts',
      invoices: 'invoices'
    };
  }

  async upload(bucket, filePath, file, options = {}) {
    try {
      const { data, error } = await this.supabase
        .storage
        .from(bucket)
        .upload(filePath, file, options);

      if (error) throw error;
      
      logger.info(`File uploaded to ${bucket}/${filePath}`);
      return data;
    } catch (error) {
      logger.error('Upload failed:', error);
      throw error;
    }
  }

  async download(bucket, filePath) {
    try {
      const { data, error } = await this.supabase
        .storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Download failed:', error);
      throw error;
    }
  }

  async delete(bucket, filePaths) {
    try {
      const { data, error } = await this.supabase
        .storage
        .from(bucket)
        .remove(filePaths);

      if (error) throw error;
      
      logger.info(`Files deleted from ${bucket}`);
      return data;
    } catch (error) {
      logger.error('Delete failed:', error);
      throw error;
    }
  }

  async getPublicUrl(bucket, filePath) {
    const { data } = this.supabase
      .storage
      .from(bucket)
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  }

  async createSignedUrl(bucket, filePath, expiresIn = 3600) {
    try {
      const { data, error } = await this.supabase
        .storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);

      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      logger.error('Failed to create signed URL:', error);
      throw error;
    }
  }
}

module.exports = new SupabaseStorage();