const Taxonomy = require('../models/Taxonomy');

// Global cache for the pipeline
let extractor = null;

async function getExtractor() {
  if (!extractor) {
    const { pipeline } = await import('@xenova/transformers');
    // Using a fast, lightweight sentence transformer model
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

// Custom cosine similarity function
function cos_sim(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const mapActivityToTaxonomy = async (req, res) => {
  try {
    const { text, context, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch all active taxonomy entries
    const query = { isActive: true };
    if (department && department !== 'All Departments') {
       query.$or = [{ department: department }, { department: { $exists: false } }, { department: null }];
    }
    
    const taxonomyData = await Taxonomy.find(query).lean();

    if (!taxonomyData.length) {
      return res.status(404).json({ message: 'No taxonomy data found in database.' });
    }

    // 2. Prepare candidates list
    const candidates = [];
    taxonomyData.forEach(item => {
      item.subProcesses.forEach(sub => {
        candidates.push({
          majorProcess: item.majorProcess,
          process: item.process,
          subProcess: sub,
          displayText: `${item.majorProcess} ${item.process} ${sub}`
        });
      });
    });

    if (!candidates.length) {
      return res.status(404).json({ message: 'No sub-processes found in taxonomy.' });
    }

    // 3. Find Best Match using Semantic Similarity
    const extract = await getExtractor();
    
    // Generate embeddings for the input text
    const textOutput = await extract(text, { pooling: 'mean', normalize: true });
    const textEmbedding = Array.from(textOutput.data);

    let bestMatch = null;
    let highestScore = -1;

    // Optimization: Generate all candidate texts
    const candidateTexts = candidates.map(c => c.subProcess);
    
    // Extract embeddings for all candidates
    const candidateOutputs = await extract(candidateTexts, { pooling: 'mean', normalize: true });
    
    // Compute cosine similarity manually
    for (let i = 0; i < candidates.length; i++) {
        const startIdx = i * candidateOutputs.dims[1];
        const endIdx = startIdx + candidateOutputs.dims[1];
        const candEmbedding = candidateOutputs.data.slice(startIdx, endIdx);
        
        const score = cos_sim(textEmbedding, candEmbedding);
        
        if (score > highestScore) {
            highestScore = score;
            bestMatch = candidates[i];
        }
    }

    // Map semantic similarity score to a confidence percentage
    // Usually scores range from 0.0 to 1.0. A score of >0.4 indicates decent semantic overlap.
    const confidence = Math.round(highestScore * 100);

    // 4. Return Suggestion
    // Reject if score is too low (meaning very little semantic similarity)
    if (highestScore < 0.35) {
      return res.json({
        mapped: false,
        message: 'No clear match found. Please use a more descriptive activity name.',
        confidence
      });
    }

    res.json({
      mapped: true,
      suggestion: {
        majorProcess: bestMatch.majorProcess,
        process: bestMatch.process,
        subProcess: bestMatch.subProcess
      },
      confidence,
      reason: `High semantic overlap with ${bestMatch.subProcess}`
    });

  } catch (err) {
    console.error('NLP Mapping Error:', err);
    res.status(500).json({ message: 'Internal server error during NLP mapping.' });
  }
};

module.exports = { mapActivityToTaxonomy };
