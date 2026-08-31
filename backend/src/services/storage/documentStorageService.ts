import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

class DocumentStorageService {
  private baseUploadDir: string;

  constructor() {
    // Resolve base uploads folder reliably whether running from root or backend/
    if (process.cwd().endsWith('backend')) {
      this.baseUploadDir = path.resolve(process.cwd(), 'uploads');
    } else {
      this.baseUploadDir = path.resolve(process.cwd(), 'backend', 'uploads');
    }
    if (!fs.existsSync(this.baseUploadDir)) {
      fs.mkdirSync(this.baseUploadDir, { recursive: true });
    }
  }

  /**
   * Ensure company upload directory exists and return safe path.
   */
  private getCompanyDir(companyId: string): string {
    const sanitizedCompanyId = companyId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetDir = path.resolve(this.baseUploadDir, sanitizedCompanyId);

    // Path traversal check
    if (!targetDir.startsWith(this.baseUploadDir)) {
      throw new Error('Invalid storage path traversal detected.');
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    return targetDir;
  }

  /**
   * Save a buffer to disk under the company's isolated directory.
   */
  public async saveFile(
    companyId: string,
    fileBuffer: Buffer,
    originalFilename: string
  ): Promise<{
    fileName: string;
    storagePath: string;
    storageReference: string;
  }> {
    const companyDir = this.getCompanyDir(companyId);
    const sanitizedOriginal = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(sanitizedOriginal).toLowerCase();

    const randomRef = `doc-${crypto.randomUUID()}`;
    const storedFileName = `${randomRef}${ext}`;
    const targetFilePath = path.resolve(companyDir, storedFileName);

    // Double check path safety
    if (!targetFilePath.startsWith(companyDir)) {
      throw new Error('Invalid destination path.');
    }

    await fs.promises.writeFile(targetFilePath, fileBuffer);

    const relativePath = path.relative(this.baseUploadDir, targetFilePath);

    return {
      fileName: storedFileName,
      storagePath: relativePath,
      storageReference: randomRef,
    };
  }

  /**
   * Retrieve file path safely.
   */
  public getFilePath(companyId: string, fileName: string): string {
    const companyDir = this.getCompanyDir(companyId);
    const sanitizedFileName = path.basename(fileName);
    const fullPath = path.resolve(companyDir, sanitizedFileName);

    if (!fullPath.startsWith(companyDir) || !fs.existsSync(fullPath)) {
      throw new Error('File not found or access denied.');
    }

    return fullPath;
  }

  /**
   * Read file buffer.
   */
  public async getFileBuffer(companyId: string, fileName: string): Promise<Buffer> {
    const filePath = this.getFilePath(companyId, fileName);
    return await fs.promises.readFile(filePath);
  }

  /**
   * Delete a stored file.
   */
  public async deleteFile(companyId: string, fileName: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(companyId, fileName);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Delete all stored files for a company directory.
   */
  public async deleteCompanyFiles(companyId: string): Promise<void> {
    try {
      const companyDir = this.getCompanyDir(companyId);
      if (fs.existsSync(companyDir)) {
        const files = await fs.promises.readdir(companyDir);
        for (const file of files) {
          const filePath = path.resolve(companyDir, file);
          if (filePath.startsWith(companyDir)) {
            await fs.promises.unlink(filePath).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn(`[DocumentStorage] Could not clean up company folder:`, e);
    }
  }
}

export const documentStorageService = new DocumentStorageService();
