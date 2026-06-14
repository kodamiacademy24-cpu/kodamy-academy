// KODAMI PROCESS PDFs — Pipeline RAG para Sensei
// Uso: node scripts/process-pdfs.js

const fs = require('fs');
const path = require('path');

let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch {
  console.log('Instalando pdf-parse...');
  require('child_process').execSync('npm install pdf-parse', { stdio: 'inherit' });
  pdfParse = require('pdf-parse');
}

const PDFS_DIR = path.join(__dirname, '..', 'pdfs-matematicas');
const CHUNK_SIZE = 500;
const WORKER_URL = 'https://kodami-api.kodami-academy24.workers.dev';

async function main() {
  console.log('📚 Pipeline RAG — Kodami Academy');
  console.log('══════════════════════════════════\n');

  if (!fs.existsSync(PDFS_DIR)) {
    console.log(`❌ No existe la carpeta: ${PDFS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(PDFS_DIR).filter(f => f.endsWith('.pdf'));
  if (files.length === 0) {
    console.log('❌ No hay PDFs en la carpeta pdfs-matematicas/');
    process.exit(1);
  }

  console.log(`📄 PDFs encontrados: ${files.length}\n`);

  let totalChunks = 0;
  const allChunks = [];

  for (const file of files) {
    const filePath = path.join(PDFS_DIR, file);
    const stats = fs.statSync(filePath);
    console.log(`📖 Procesando: ${file} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

    try {
      const buf = fs.readFileSync(filePath);
      const dataU8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const pdf = new pdfParse.PDFParse({ data: dataU8 });
      const result = await pdf.getText();
      const text = result.text || '';
      const pages = result.pages || result.total || 0;

      console.log(`   Páginas: ${pages}, Caracteres: ${text.length}`);

      const chunks = splitIntoChunks(text, CHUNK_SIZE);
      console.log(`   Chunks generados: ${chunks.length}`);

      chunks.forEach((chunk, i) => {
        allChunks.push({
          materia: 'matematicas',
          libro: file,
          chunk_index: i,
          contenido: chunk
        });
      });

      totalChunks += chunks.length;
      await pdf.destroy();
    } catch (e) {
      console.error(`   ❌ Error: ${e.message}`);
    }
    console.log('');
  }

  console.log(`\n📊 Total de chunks a subir: ${totalChunks}`);
  console.log('⏫ Subiendo a D1...\n');

  let subidos = 0;
  let errores = 0;

  for (const chunk of allChunks) {
    try {
      const res = await fetch(`${WORKER_URL}/api/cerebro/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });
      const json = await res.json();
      if (json.success) {
        subidos++;
        if (subidos % 50 === 0) process.stdout.write(`   ${subidos}/${totalChunks}\r`);
      } else {
        errores++;
      }
    } catch {
      errores++;
    }
  }

  console.log(`\n✅ Completado!`);
  console.log(`   Subidos: ${subidos}`);
  console.log(`   Errores: ${errores}`);

  console.log('\n🔍 Verificando chunks en D1...');
  try {
    const res = await fetch(`${WORKER_URL}/api/cerebro/stats`);
    const json = await res.json();
    if (json.success) {
      console.log(`   Chunks en D1: ${json.data.total}`);
      console.log(`   Libros indexados: ${json.data.libros}`);
    }
  } catch {
    console.log('   No se pudo verificar');
  }

  console.log('\n🎯 Sensei ahora puede responder con tus libros!');
}

function splitIntoChunks(text, targetTokens) {
  const charsPerToken = 4;
  const chunkChars = targetTokens * charsPerToken;
  const paragraphs = text.split('\n').filter(p => p.trim().length > 0);
  const chunks = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + para).length > chunkChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para + ' ';
    } else {
      currentChunk += para + ' ';
    }
  }
  if (currentChunk.trim().length > 50) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

main().catch(console.error);
