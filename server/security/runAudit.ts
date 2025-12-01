import * as fs from 'fs';
import * as path from 'path';
import { alertDependencyVulnerability, alertInfo } from './alerting.js';

interface NpmAuditVulnerability {
  name: string;
  severity: string;
  isDirect: boolean;
  via: Array<string | { title: string; url: string; severity: string }>;
  effects: string[];
  range: string;
  nodes: string[];
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean };
}

interface NpmAuditReport {
  auditReportVersion: number;
  vulnerabilities: Record<string, NpmAuditVulnerability>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
    dependencies: {
      prod: number;
      dev: number;
      optional: number;
      peer: number;
      peerOptional: number;
      total: number;
    };
  };
}

async function runSecurityAudit(): Promise<void> {
  console.log('='.repeat(60));
  console.log('GEMFORGE CHRONICLES - SECURITY AUDIT');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('');

  const reportPath = path.join(process.cwd(), 'security-audit-report.json');
  
  if (!fs.existsSync(reportPath)) {
    console.log('No npm audit report found. Run: npm audit --json > security-audit-report.json');
    process.exit(1);
  }

  const reportContent = fs.readFileSync(reportPath, 'utf-8');
  let report: NpmAuditReport;
  
  try {
    report = JSON.parse(reportContent);
  } catch (error) {
    console.error('Failed to parse audit report:', error);
    process.exit(1);
  }

  const { metadata, vulnerabilities } = report;
  const vulnCounts = metadata.vulnerabilities;

  console.log('DEPENDENCY VULNERABILITY SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total Dependencies: ${metadata.dependencies.total}`);
  console.log(`  Production: ${metadata.dependencies.prod}`);
  console.log(`  Development: ${metadata.dependencies.dev}`);
  console.log('');
  console.log('Vulnerabilities Found:');
  console.log(`  🔴 Critical: ${vulnCounts.critical}`);
  console.log(`  🟠 High:     ${vulnCounts.high}`);
  console.log(`  🟡 Moderate: ${vulnCounts.moderate}`);
  console.log(`  🔵 Low:      ${vulnCounts.low}`);
  console.log(`  ⚪ Info:     ${vulnCounts.info}`);
  console.log(`  ─────────────────────`);
  console.log(`  Total:      ${vulnCounts.total}`);
  console.log('');

  if (vulnCounts.total > 0) {
    console.log('VULNERABILITY DETAILS');
    console.log('-'.repeat(40));
    
    const sortedVulns = Object.entries(vulnerabilities).sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
      return (severityOrder[a[1].severity as keyof typeof severityOrder] || 5) - 
             (severityOrder[b[1].severity as keyof typeof severityOrder] || 5);
    });

    for (const [pkgName, vuln] of sortedVulns) {
      const icon = vuln.severity === 'critical' ? '🔴' : 
                   vuln.severity === 'high' ? '🟠' :
                   vuln.severity === 'moderate' ? '🟡' : '🔵';
      
      console.log(`${icon} ${pkgName} (${vuln.severity.toUpperCase()})`);
      console.log(`   Direct dependency: ${vuln.isDirect ? 'Yes' : 'No'}`);
      console.log(`   Fix available: ${vuln.fixAvailable ? 'Yes' : 'No'}`);
      
      const advisoryInfo = vuln.via.find(v => typeof v === 'object');
      if (advisoryInfo && typeof advisoryInfo === 'object') {
        console.log(`   Advisory: ${advisoryInfo.title}`);
        console.log(`   URL: ${advisoryInfo.url}`);
      }
      console.log('');

      if (vuln.severity === 'critical' || vuln.severity === 'high' || vuln.severity === 'moderate') {
        await alertDependencyVulnerability(
          vuln.severity,
          pkgName,
          typeof advisoryInfo === 'object' ? advisoryInfo.title : 'See npm audit'
        );
      }
    }
  }

  console.log('RECOMMENDATIONS');
  console.log('-'.repeat(40));
  
  if (vulnCounts.critical > 0 || vulnCounts.high > 0) {
    console.log('⚠️  HIGH PRIORITY: Run `npm audit fix` to address critical/high vulnerabilities');
    console.log('   Some fixes may require major version updates - review carefully');
  }
  
  if (vulnCounts.total === 0) {
    console.log('✅ No vulnerabilities found! Dependencies are clean.');
    await alertInfo('Security Audit Complete', 'No vulnerabilities found in dependencies');
  }

  console.log('');
  console.log('Next audit recommended: Weekly or after dependency updates');
  console.log('='.repeat(60));

  const summaryReport = {
    timestamp: new Date().toISOString(),
    totalDependencies: metadata.dependencies.total,
    vulnerabilities: vulnCounts,
    status: vulnCounts.critical > 0 || vulnCounts.high > 0 ? 'ACTION_REQUIRED' : 
            vulnCounts.total > 0 ? 'REVIEW_RECOMMENDED' : 'CLEAN'
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'security-audit-summary.json'),
    JSON.stringify(summaryReport, null, 2)
  );

  console.log('Summary written to: security-audit-summary.json');
}

runSecurityAudit().catch(console.error);
