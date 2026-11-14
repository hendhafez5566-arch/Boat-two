'use client';
import { Component, type ReactNode } from 'react';
import { downloadFlowRecovery, readFlowRecovery } from '../../lib/flow-recovery';
export default class EditorErrorBoundary extends Component<
  { flowId: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const recovery = readFlowRecovery(this.props.flowId);
    return (
      <main
        className="card stack"
        dir="rtl"
        style={{ margin: '8vh auto', padding: 28, maxWidth: 640 }}
        role="alert"
      >
        <h1>تعذّر عرض مصمم البوت / Editor interrupted</h1>
        <p>
          {recovery
            ? 'توجد نسخة استرجاع محلية. أعد فتح المصمم ثم اختر استعادة المسودة، أو نزّل نسخة الآن.'
            : 'أعد فتح المصمم لتحميل آخر مسودة محفوظة. لم يتم نشر أي تعديل بسبب هذا الخطأ.'}
        </p>
        <p>
          Reopen the editor to recover your local draft. You can also download the recovery copy
          when available.
        </p>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            إعادة فتح المصمم / Reopen editor
          </button>
          {recovery && (
            <button
              className="btn"
              onClick={() => downloadFlowRecovery(recovery, this.props.flowId)}
            >
              تنزيل نسخة الاسترجاع / Download recovery
            </button>
          )}
        </div>
      </main>
    );
  }
}
