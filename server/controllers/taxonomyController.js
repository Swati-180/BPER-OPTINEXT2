const Taxonomy = require('../models/Taxonomy');
const { logAction } = require('../utils/auditLogger');
const stringSimilarity = require('string-similarity');


const https = require('https');

// Helper to make https request with timeouts
function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000 // 10 seconds timeout
    };
    
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => {
            try {
              return Promise.resolve(JSON.parse(data));
            } catch (e) {
              return Promise.reject(new Error(`Failed to parse JSON: ${data}`));
            }
          },
          text: () => Promise.resolve(data)
        });
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let globalCandidateCache = null;

async function getGlobalCandidateCache() {
  if (!globalCandidateCache) {
    console.log('Building AI Taxonomy candidate cache...');
    const allActive = await Taxonomy.find({ isActive: true }).lean();
    const candidates = [];
    allActive.forEach(item => {
      item.subProcesses.forEach(sub => {
        candidates.push({
          majorProcess: item.majorProcess,
          process: item.process,
          subProcess: sub,
          department: item.department,
          tags: item.tags || []
        });
      });
    });
    globalCandidateCache = candidates;
    console.log(`AI Taxonomy candidate cache built successfully with ${candidates.length} items.`);
  }
  return globalCandidateCache;
}

const mapActivity = async (req, res) => {
  try {
    const { text, department } = req.body;

    if (!text || text.trim().length < 3) {
      return res.status(400).json({ message: 'Input text too short for analysis.' });
    }

    // 1. Fetch the global candidate cache (fast local db fetch, no Xenova embeddings)
    const cachedCandidates = await getGlobalCandidateCache();

    if (!cachedCandidates.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 2. Clone and filter candidates by department in memory
    let candidates = cachedCandidates.map(c => ({ ...c }));
    if (department && department !== 'All Departments') {
      candidates = candidates.filter(c => 
        c.department === department || !c.department
      );
    }

    if (!candidates.length) {
      return res.json({ mapped: false, confidence: 0 });
    }

    // 3. Compute fast lexical similarity scores locally for all candidates
    candidates.forEach((cand) => {
        // Compare query with subProcess name
        const stringSimScore = stringSimilarity.compareTwoStrings(text.toLowerCase(), cand.subProcess.toLowerCase());
        
        // Compare query with full hierarchy string
        const fullStringSimScore = stringSimilarity.compareTwoStrings(text.toLowerCase(), `${cand.majorProcess} - ${cand.process} - ${cand.subProcess}`.toLowerCase());
        
        let bestStringSim = Math.max(stringSimScore, fullStringSimScore);
        let matchedTag = null;
        
        // Compare query with individual tags (synonyms)
        if (cand.tags && cand.tags.length > 0) {
            cand.tags.forEach(tag => {
                const tagSim = stringSimilarity.compareTwoStrings(text.toLowerCase(), tag.toLowerCase());
                if (tagSim > bestStringSim) {
                    bestStringSim = tagSim;
                    matchedTag = tag;
                }
            });
        }
        
        cand.confidence = Math.max(0, Math.round(bestStringSim * 100));
        cand.matchedTag = matchedTag;
    });

    // Sort by lexical match
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Take the top 15 candidates to send to Groq for deep semantic matching, ensuring process diversity
    const topCandidates = [];
    const processCounts = {};

    for (const cand of candidates) {
      if (topCandidates.length >= 15) break;
      const key = `${cand.majorProcess}::${cand.process}`;
      processCounts[key] = processCounts[key] || 0;
      if (processCounts[key] < 3) {
        topCandidates.push(cand);
        processCounts[key]++;
      }
    }

    // 4. Call Groq API for Semantic Match
    const groqApiKey = process.env.GROQ_API_KEY;
    let bestResult = null;
    let alternatives = [];
    let isGroqSuccessful = false;

    try {
      const groqPayload = {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are an accurate corporate process mapping assistant. Your job is to map custom user inputs to standard corporate activities. If the input is unrelated to corporate tasks (like shipping containers, personal items, random characters), you must report no match by setting bestMatchIndex to -1 and confidence to 0.'
          },
          // Few-shot Example 1: Out of Domain
          {
            role: 'user',
            content: `User custom input: "pizza delivery for office lunch"
User department: "All Departments"

Candidate list (0-indexed):
0: [Accounts Payable / Vendor Management] -> Vendor Onboarding
1: [Employee Life Cycle Management / Joining/onboarding] -> Employee Code Creation

Select the best matching candidate from the list.
Rules:
1. Provide a confidence score (0 to 100) based on how well the input semantically maps to the candidate. Be highly critical.
2. If the user's input is completely out of domain, unrelated to corporate finance/HR activities, or does not clearly map to any of the specific candidates in the list, you MUST set "bestMatchIndex": -1 and "confidence": 0. Do not hallucinate a connection or map a general/unrelated term.
3. Select up to 3 alternative suggestion indices from the candidate list that are also highly relevant.
4. Your response must be a single JSON object with this exact schema:
{
  "bestMatchIndex": number,
  "confidence": number,
  "alternativeIndices": [number, number, number]
}
Do not include any markdown format blocks or introductory text, only raw JSON.`
          },
          {
            role: 'assistant',
            content: JSON.stringify({
              bestMatchIndex: -1,
              confidence: 0,
              alternativeIndices: [-1, -1, -1]
            })
          },
          // Few-shot Example 2: In Domain
          {
            role: 'user',
            content: `User custom input: "setup credentials for new developer"
User department: "All Departments"

Candidate list (0-indexed):
0: [Accounts Payable / Vendor Management] -> Vendor Onboarding
1: [Employee Life Cycle Management / Joining/onboarding] -> ADID and Email ID Creation request

Select the best matching candidate from the list.
Rules:
1. Provide a confidence score (0 to 100) based on how well the input semantically maps to the candidate. Be highly critical.
2. If the user's input is completely out of domain, unrelated to corporate finance/HR activities, or does not clearly map to any of the specific candidates in the list, you MUST set "bestMatchIndex": -1 and "confidence": 0. Do not hallucinate a connection or map a general/unrelated term.
3. Select up to 3 alternative suggestion indices from the candidate list that are also highly relevant.
4. Your response must be a single JSON object with this exact schema:
{
  "bestMatchIndex": number,
  "confidence": number,
  "alternativeIndices": [number, number, number]
}
Do not include any markdown format blocks or introductory text, only raw JSON.`
          },
          {
            role: 'assistant',
            content: JSON.stringify({
              bestMatchIndex: 1,
              confidence: 90,
              alternativeIndices: [-1, -1, -1]
            })
          },
          // Actual query
          {
            role: 'user',
            content: `User custom input: "${text}"
User department: "${department || 'N/A'}"

Candidate list (0-indexed):
${topCandidates.map((c, i) => `${i}: [${c.majorProcess} / ${c.process}] -> ${c.subProcess}${c.matchedTag ? ` (Tags: ${c.matchedTag})` : ''}`).join('\n')}

Select the best matching candidate from the list.
Rules:
1. Provide a confidence score (0 to 100) based on how well the input semantically maps to the candidate. Be highly critical.
2. If the user's input is completely out of domain, unrelated to corporate finance/HR activities, or does not clearly map to any of the specific candidates in the list, you MUST set "bestMatchIndex": -1 and "confidence": 0. Do not hallucinate a connection or map a general/unrelated term.
3. Select up to 3 alternative suggestion indices from the candidate list that are also highly relevant.
4. Your response must be a single JSON object with this exact schema:
{
  "bestMatchIndex": number,
  "confidence": number,
  "alternativeIndices": [number, number, number]
}
Do not include any markdown format blocks or introductory text, only raw JSON.`
          }
        ],
        temperature: 0.0,
        response_format: { type: "json_object" }
      };

      const apiRes = await makeRequest('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: groqPayload
      });

      if (apiRes.ok) {
        const json = await apiRes.json();
        const contentStr = json.choices?.[0]?.message?.content;
        const result = JSON.parse(contentStr);

        if (result && typeof result.bestMatchIndex === 'number') {
          if (result.bestMatchIndex >= 0 && result.bestMatchIndex < topCandidates.length) {
            bestResult = { ...topCandidates[result.bestMatchIndex] };
            bestResult.confidence = typeof result.confidence === 'number' ? result.confidence : 50;

            // Parse alternatives
            if (Array.isArray(result.alternativeIndices)) {
              const seen = new Set([bestResult.subProcess]);
              result.alternativeIndices.forEach(idx => {
                if (idx >= 0 && idx < topCandidates.length) {
                  const alt = topCandidates[idx];
                  if (!seen.has(alt.subProcess)) {
                    seen.add(alt.subProcess);
                    // Estimate confidence for alternative
                    const altConfidence = Math.max(10, bestResult.confidence - 5);
                    alternatives.push({ ...alt, confidence: altConfidence });
                  }
                }
              });
            }
          } else {
            // Explicitly no match from Groq LLM.
            // Check if we have an exact tag or subProcess match in topCandidates (confidence = 100 or exact text match)
            const exactMatch = topCandidates.find(c => 
              c.confidence === 100 || 
              (c.matchedTag && c.matchedTag.toLowerCase() === text.toLowerCase()) ||
              (c.subProcess && c.subProcess.toLowerCase() === text.toLowerCase())
            );

            if (exactMatch) {
              bestResult = { ...exactMatch };
              bestResult.confidence = Math.max(exactMatch.confidence || 0, 100);
              
              // Build default alternatives using top candidates
              const seen = new Set([bestResult.subProcess]);
              for (let i = 0; i < Math.min(topCandidates.length, 4); i++) {
                const alt = topCandidates[i];
                if (!seen.has(alt.subProcess)) {
                  seen.add(alt.subProcess);
                  alternatives.push({ ...alt, confidence: 95 });
                }
              }
            } else {
              bestResult = { ...topCandidates[0] };
              bestResult.confidence = typeof result.confidence === 'number' ? result.confidence : 0;
              
              // Build default alternatives using top 3 candidates
              const seen = new Set([bestResult.subProcess]);
              for (let i = 1; i < Math.min(topCandidates.length, 4); i++) {
                const alt = topCandidates[i];
                if (!seen.has(alt.subProcess)) {
                  seen.add(alt.subProcess);
                  alternatives.push({ ...alt, confidence: 10 });
                }
              }
            }
          }
          isGroqSuccessful = true;
        }
      } else {
        const errText = await apiRes.text();
        console.error(`Groq API Error: Status ${apiRes.status}, Body: ${errText}`);
      }
    } catch (groqErr) {
      console.error('Groq Mapping Failed, falling back to lexical matcher:', groqErr);
    }

    // 5. Safe Fallback to local string similarity if Groq fails
    if (!isGroqSuccessful) {
      bestResult = { ...candidates[0] };
      const seen = new Set([bestResult.subProcess]);
      for (let i = 1; i < candidates.length; i++) {
        if (alternatives.length >= 3) break;
        if (!seen.has(candidates[i].subProcess)) {
          seen.add(candidates[i].subProcess);
          alternatives.push({ ...candidates[i] });
        }
      }
    }

    const confidence = bestResult.confidence;
    const hasLowConfidence = confidence < 35;

    // 6. Audit Log
    if (confidence > 50) {
      await logAction({
        req,
        action: 'NLP_MAPPING_MATCH',
        targetType: 'Taxonomy',
        targetId: 'NLP_ENGINE',
        description: `Mapped "${text.substring(0, 50)}..." to ${bestResult.subProcess} (${confidence}%)`
      });
    }

    if (hasLowConfidence) {
      return res.json({
        mapped: true,
        noMatch: true,
        message: "No exact matches found (HR & Finance only).",
        suggestion: {
          majorProcess: bestResult.majorProcess,
          process: bestResult.process,
          subProcess: bestResult.subProcess
        },
        alternatives: alternatives.map(a => ({
          majorProcess: a.majorProcess,
          process: a.process,
          subProcess: a.subProcess,
          confidence: a.confidence
        })),
        confidence: confidence,
        reason: "Closest suggestion"
      });
    }

    res.json({
      mapped: true,
      suggestion: {
        majorProcess: bestResult.majorProcess,
        process: bestResult.process,
        subProcess: bestResult.subProcess
      },
      alternatives: alternatives.map(a => ({
        majorProcess: a.majorProcess,
        process: a.process,
        subProcess: a.subProcess,
        confidence: a.confidence
      })),
      confidence: confidence,
      reason: isGroqSuccessful ? "Groq LLM semantic match" : "Lexical match"
    });

  } catch (err) {
    console.error('NLP Error:', err);
    res.status(500).json({ message: err.message });
  }
};

const createTaxonomy = async (req, res) => {
  try {
    const { majorProcess, process, subProcesses, department } = req.body;
    
    // Check for existing to update or create simple one
    let entry = await Taxonomy.findOne({ majorProcess, process });
    const isNew = !entry;
    const prevSubProcesses = entry ? [...entry.subProcesses] : [];
    
    if (entry) {
      // Merge sub-processes
      const existingSubs = entry.subProcesses || [];
      const nextSubs = [...new Set([...existingSubs, ...subProcesses])];
      entry.subProcesses = nextSubs;
      await entry.save();
    } else {
      entry = await Taxonomy.create({
        majorProcess,
        process,
        subProcesses,
        department,
        isActive: true
      });
    }

    // AUDIT LOG
    await logAction({
        req,
        action: 'TAXONOMY_SAVED',
        targetType: 'Taxonomy',
        targetId: entry._id,
        description: `${isNew ? 'Created' : 'Updated'} taxonomy entry for ${majorProcess} / ${process}`,
        prev: isNew ? null : { subProcesses: prevSubProcesses },
        next: { subProcesses: entry.subProcesses }
    });
    
    // Invalidate AI matching cache
    globalCandidateCache = null;
    
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateTaxonomy = async (req, res) => {
  try {
    const { id } = req.params;
    const { majorProcess, process, subProcesses, department } = req.body;

    const entry = await Taxonomy.findById(id);
    if (!entry) {
      return res.status(404).json({ message: 'Taxonomy entry not found.' });
    }

    const prev = {
      majorProcess: entry.majorProcess,
      process: entry.process,
      subProcesses: entry.subProcesses,
      department: entry.department,
    };

    if (typeof majorProcess === 'string' && majorProcess.trim()) {
      entry.majorProcess = majorProcess.trim();
    }
    if (typeof process === 'string' && process.trim()) {
      entry.process = process.trim();
    }
    if (Array.isArray(subProcesses)) {
      entry.subProcesses = subProcesses.map((s) => String(s).trim()).filter(Boolean);
    }

    if (department === null || department === undefined || department === 'All Departments' || String(department).trim() === '') {
      entry.department = undefined;
    } else {
      entry.department = String(department).trim();
    }

    await entry.save();

    await logAction({
      req,
      action: 'TAXONOMY_UPDATED',
      targetType: 'Taxonomy',
      targetId: entry._id,
      description: `Updated taxonomy entry for ${entry.majorProcess} / ${entry.process}`,
      prev,
      next: {
        majorProcess: entry.majorProcess,
        process: entry.process,
        subProcesses: entry.subProcesses,
        department: entry.department,
      },
    });

    // Invalidate AI matching cache
    globalCandidateCache = null;

    res.json(entry);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: 'A taxonomy with this major process and process already exists.' });
    }
    res.status(500).json({ message: err.message });
  }
};

const deleteTaxonomy = async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await Taxonomy.findById(id);
    if (!entry) {
      return res.status(404).json({ message: 'Taxonomy entry not found.' });
    }

    entry.isActive = false;
    await entry.save();

    await logAction({
      req,
      action: 'TAXONOMY_DELETED',
      targetType: 'Taxonomy',
      targetId: entry._id,
      description: `Soft deleted taxonomy entry for ${entry.majorProcess} / ${entry.process}`,
      prev: {
        majorProcess: entry.majorProcess,
        process: entry.process,
        isActive: true,
      },
      next: {
        isActive: false,
      },
    });

    // Invalidate AI matching cache
    globalCandidateCache = null;

    res.json({ message: 'Taxonomy deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { mapActivity, createTaxonomy, updateTaxonomy, deleteTaxonomy };
