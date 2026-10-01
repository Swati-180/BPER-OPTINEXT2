const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function convertExcelToJson() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '../../F&A Listing_30.09.2026.xlsx');
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  
  const towersMap = new Map(); // Major Process -> { name: string, processesMap: Map }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const values = row.values;
    const majorProcess = (values[2] || '').toString().trim();
    const process = (values[3] || '').toString().trim();
    const subprocess = (values[4] || '').toString().trim();

    if (!majorProcess || !process || !subprocess) return;

    if (!towersMap.has(majorProcess)) {
      towersMap.set(majorProcess, {
        name: majorProcess,
        processesMap: new Map()
      });
    }

    const tower = towersMap.get(majorProcess);
    
    if (!tower.processesMap.has(process)) {
      tower.processesMap.set(process, {
        name: process,
        subProcessesSet: new Set()
      });
    }

    const proc = tower.processesMap.get(process);
    proc.subProcessesSet.add(subprocess);
  });

  const towers = [];
  for (const towerVal of towersMap.values()) {
    const processes = [];
    for (const procVal of towerVal.processesMap.values()) {
      const subProcesses = Array.from(procVal.subProcessesSet).map(sp => ({ name: sp }));
      processes.push({
        name: procVal.name,
        subProcesses: subProcesses
      });
    }
    towers.push({
      name: towerVal.name,
      processes: processes
    });
  }

  const output = { towers };
  const outPath = path.join(__dirname, '../../fa_activities_real.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('Successfully created fa_activities_real.json');
}

convertExcelToJson().catch(console.error);
