const AI_ANALYSIS_PIPELINE_STATUSES = new Set([
  "discovered",
  "analyzed",
]);

export function shouldRecordAiAnalysisStatus(currentStatus?: string) {
  return currentStatus === undefined || AI_ANALYSIS_PIPELINE_STATUSES.has(currentStatus);
}
