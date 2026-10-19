const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const isConfirmed = process.argv.includes('--confirm');
const backupDir = path.join(__dirname, '..', 'backups');

async function restore() {
  console.log('================================================================');
  console.log('DATABASE RESTORE UTILITY');
  console.log(`Backup Directory: ${backupDir}`);
  console.log(`Mode:             ${isConfirmed ? 'CONFIRMED (Executing restore)' : 'PREVIEW (Pass --confirm to apply)'}`);
  console.log('================================================================\n');

  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup directory not found at ${backupDir}`);
  }

  const collections = ['wdtsubmissions', 'taxonomies', 'processanalyses', 'users'];
  
  // Verify all backup files exist
  for (const coll of collections) {
    const file = path.join(backupDir, `${coll}_backup.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing required backup file: ${file}`);
    }
  }

  const mongoUri = process.env.MONGODB_URI || '';
  const maskedUri = mongoUri.replace(/:([^:@]+)@/, ':****@');
  console.log(`Target Database: ${maskedUri}\n`);

  await mongoose.connect(mongoUri);

  for (const coll of collections) {
    const file = path.join(backupDir, `${coll}_backup.json`);
    const docs = JSON.parse(fs.readFileSync(file, 'utf8'));
    const currentCount = await mongoose.connection.db.collection(coll).countDocuments();
    console.log(`Collection "${coll}": Current in DB = ${currentCount}, Backup File has = ${docs.length} docs`);
  }

  if (!isConfirmed) {
    console.log('\n================================================================');
    console.log('PREVIEW COMPLETE: No changes were made to the database.');
    console.log('To execute the restore, run:');
    console.log('node server/scripts/restore_backup.js --confirm');
    console.log('================================================================');
    process.exit(0);
  }

  console.log('\n--- EXECUTING RESTORE ---');
  for (const coll of collections) {
    const file = path.join(backupDir, `${coll}_backup.json`);
    const docs = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Clear and restore
    await mongoose.connection.db.collection(coll).deleteMany({});
    if (docs.length > 0) {
      // Reconstitute ObjectIds if present
      const sanitized = docs.map(d => {
        if (d._id && typeof d._id === 'object' && d._id.$oid) {
          d._id = new mongoose.Types.ObjectId(d._id.$oid);
        } else if (d._id && typeof d._id === 'string' && d._id.length === 24) {
          d._id = new mongoose.Types.ObjectId(d._id);
        }
        return d;
      });
      await mongoose.connection.db.collection(coll).insertMany(sanitized);
    }
    const finalCount = await mongoose.connection.db.collection(coll).countDocuments();
    console.log(`Restored "${coll}": ${finalCount} documents.`);
  }

  console.log('\n================================================================');
  console.log('DATABASE RESTORE COMPLETED SUCCESSFULLY');
  console.log('================================================================');
  process.exit(0);
}

restore().catch(err => {
  console.error('Fatal error during restore:', err);
  process.exit(1);
});
