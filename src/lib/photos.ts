import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Diretório permanente das fotos de observação. O picker/câmera devolvem URIs
 * em cache (que o SO pode limpar a qualquer momento); como a foto precisa
 * sobreviver offline até subir pro Storage, copiamos pro documentDirectory.
 */
const photosDir = new Directory(Paths.document, 'observation-photos');

/** Copia a foto temporária p/ armazenamento permanente e retorna a URI local. */
export async function persistPhoto(tempUri: string): Promise<string> {
  photosDir.create({ intermediates: true, idempotent: true });
  const dest = new File(photosDir, `${Crypto.randomUUID()}.jpg`);
  await new File(tempUri).copy(dest);
  return dest.uri;
}

/** Remove a cópia local (após upload confirmado ou descarte da observação). */
export function deleteLocalPhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort: arquivo já removido pelo SO não é erro
  }
}
