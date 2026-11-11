import {
  WebTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-web";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { DocumentLoadInstrumentation } from "@opentelemetry/instrumentation-document-load";
import { ZoneContextManager } from "@opentelemetry/context-zone";
import { resourceFromAttributes } from "@opentelemetry/resources";

export interface ReplayFormattedSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: "ok" | "error" | "unset";
  status_code: number | null;
  start_time: string;
  end_time: string;
  duration_ms: number;
  attributes: Record<string, unknown>;
}

// Custom OpenTelemetry SpanExporter that forwards spans to Replay Console
class ReplaySpanExporter implements SpanExporter {
  private onSpan: (span: ReplayFormattedSpan) => void;

  constructor(onSpan: (span: ReplayFormattedSpan) => void) {
    this.onSpan = onSpan;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: number; error?: Error }) => void
  ): void {
    for (const span of spans) {
      const spanContext = span.spanContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anySpan = span as any;
      const startMs = span.startTime[0] * 1000 + span.startTime[1] / 1_000_000;
      const endMs = span.endTime[0] * 1000 + span.endTime[1] / 1_000_000;
      const durationMs = Math.max(0, Math.round(endMs - startMs));

      let statusCode: number | null = null;
      if (typeof span.attributes["http.status_code"] === "number") {
        statusCode = span.attributes["http.status_code"];
      } else if (typeof span.attributes["http.response.status_code"] === "number") {
        statusCode = span.attributes["http.response.status_code"];
      }

      let statusStr: "ok" | "error" | "unset" = "unset";
      if (span.status.code === 2) statusStr = "error";
      else if (span.status.code === 1) statusStr = "ok";
      else if (statusCode && statusCode >= 400) statusStr = "error";
      else if (statusCode && statusCode < 400) statusStr = "ok";

      const parentId =
        anySpan.parentSpanContext?.spanId ||
        anySpan.parentSpanId ||
        null;

      const formatted: ReplayFormattedSpan = {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        parent_span_id: parentId,
        name: span.name,
        kind: String(span.kind),
        status: statusStr,
        status_code: statusCode,
        start_time: new Date(startMs).toISOString(),
        end_time: new Date(endMs).toISOString(),
        duration_ms: durationMs,
        attributes: span.attributes as Record<string, unknown>,
      };

      this.onSpan(formatted);
    }
    resultCallback({ code: 0 });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

// Global initialization function
export function initOtelTracer(options: {
  serviceName?: string;
  onSpan: (span: ReplayFormattedSpan) => void;
}) {
  const exporter = new ReplaySpanExporter(options.onSpan);

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      "service.name": options.serviceName || "web-browser",
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  provider.register({
    contextManager: new ZoneContextManager(),
  });

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [/.*/],
        clearTimingResources: true,
      }),
      new DocumentLoadInstrumentation(),
    ],
  });

  return provider;
}

// Attach to window for recorder.js
(window as unknown as { __initOtelTracer: typeof initOtelTracer }).__initOtelTracer = initOtelTracer;
