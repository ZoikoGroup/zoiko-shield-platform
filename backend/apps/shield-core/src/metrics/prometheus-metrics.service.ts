import { Injectable } from '@nestjs/common';

interface MetricLabels {
  [key: string]: string | number | undefined;
}

interface CounterMetric {
  name: string;
  help: string;
  type: 'counter';
  values: Map<string, { value: number; labels: MetricLabels }>;
}

interface GaugeMetric {
  name: string;
  help: string;
  type: 'gauge';
  values: Map<string, { value: number; labels: MetricLabels }>;
}

interface HistogramMetric {
  name: string;
  help: string;
  type: 'histogram';
  buckets: number[];
  records: Array<{ value: number; labels: MetricLabels }>;
}

@Injectable()
export class PrometheusMetricsService {
  private readonly counters = new Map<string, CounterMetric>();
  private readonly gauges = new Map<string, GaugeMetric>();
  private readonly histograms = new Map<string, HistogramMetric>();

  constructor() {
    this.initDefaultMetrics();
  }

  private initDefaultMetrics(): void {
    this.registerCounter(
      'zoiko_events_ingested_total',
      'Total number of security events ingested into ZoikoShield',
    );
    this.registerCounter(
      'zoiko_soar_actions_executed_total',
      'Total number of governed SOAR containment actions executed',
    );
    this.registerCounter(
      'zoiko_ai_token_usage_total',
      'Total number of AI tokens consumed across models and tenants',
    );
    this.registerGauge(
      'zoiko_active_tenants_total',
      'Total number of active commercial tenant instances',
    );
    this.registerHistogram(
      'zoiko_detection_evaluation_duration_seconds',
      'Time spent evaluating detection rules against telemetry stream',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    );
    this.registerHistogram(
      'zoiko_merkle_epoch_duration_seconds',
      'Time taken to compute Merkle root checkpoints and publish witness attestations',
      [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    );
  }

  registerCounter(name: string, help: string): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, {
        name,
        help,
        type: 'counter',
        values: new Map(),
      });
    }
  }

  registerGauge(name: string, help: string): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, {
        name,
        help,
        type: 'gauge',
        values: new Map(),
      });
    }
  }

  registerHistogram(name: string, help: string, buckets: number[]): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        name,
        help,
        type: 'histogram',
        buckets: [...buckets].sort((a, b) => a - b),
        records: [],
      });
    }
  }

  incrementCounter(
    name: string,
    value: number = 1,
    labels: MetricLabels = {},
  ): void {
    const counter = this.counters.get(name);
    if (!counter) return;

    const labelKey = this.formatLabelKey(labels);
    const existing = counter.values.get(labelKey);
    if (existing) {
      existing.value += value;
    } else {
      counter.values.set(labelKey, { value, labels });
    }
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const gauge = this.gauges.get(name);
    if (!gauge) return;

    const labelKey = this.formatLabelKey(labels);
    gauge.values.set(labelKey, { value, labels });
  }

  observeHistogram(
    name: string,
    value: number,
    labels: MetricLabels = {},
  ): void {
    const histogram = this.histograms.get(name);
    if (!histogram) return;

    histogram.records.push({ value, labels });
  }

  /**
   * Generates Prometheus exposition format (text/plain; version=0.0.4)
   */
  exportPrometheusText(): string {
    const lines: string[] = [];

    // Counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      if (counter.values.size === 0) {
        lines.push(`${counter.name} 0`);
      } else {
        for (const entry of counter.values.values()) {
          const labelStr = this.renderLabels(entry.labels);
          lines.push(`${counter.name}${labelStr} ${entry.value}`);
        }
      }
    }

    // Gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      if (gauge.values.size === 0) {
        lines.push(`${gauge.name} 0`);
      } else {
        for (const entry of gauge.values.values()) {
          const labelStr = this.renderLabels(entry.labels);
          lines.push(`${gauge.name}${labelStr} ${entry.value}`);
        }
      }
    }

    // Histograms
    for (const hist of this.histograms.values()) {
      lines.push(`# HELP ${hist.name} ${hist.help}`);
      lines.push(`# TYPE ${hist.name} histogram`);

      const sum = hist.records.reduce((acc, r) => acc + r.value, 0);
      const count = hist.records.length;

      for (const bucket of hist.buckets) {
        const bucketCount = hist.records.filter(
          (r) => r.value <= bucket,
        ).length;
        lines.push(`${hist.name}_bucket{le="${bucket}"} ${bucketCount}`);
      }
      lines.push(`${hist.name}_bucket{le="+Inf"} ${count}`);
      lines.push(`${hist.name}_sum ${sum.toFixed(6)}`);
      lines.push(`${hist.name}_count ${count}`);
    }

    return lines.join('\n') + '\n';
  }

  private formatLabelKey(labels: MetricLabels): string {
    return Object.entries(labels)
      .filter(([_, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  private renderLabels(labels: MetricLabels): string {
    const formatted = this.formatLabelKey(labels);
    return formatted ? `{${formatted}}` : '';
  }
}
