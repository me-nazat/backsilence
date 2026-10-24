/* ── Stepper.ts ───────────────────────────────────────────────────────────
 *  Sequential multi-step progress indicator and control component.
 * ──────────────────────────────────────────────────────────────────────── */

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

export interface StepperOptions {
  steps: StepperStep[];
  activeStep?: number; // 0-indexed
  onStepChange?: (stepIndex: number) => void;
  className?: string;
}

export class Stepper {
  readonly element: HTMLElement;
  private currentStep: number;
  private readonly steps: StepperStep[];
  private readonly onStepChange?: ((stepIndex: number) => void) | undefined;

  constructor(opts: StepperOptions) {
    this.element = document.createElement('div');
    this.element.className = `bs-stepper ${opts.className ?? ''}`;
    this.element.setAttribute('role', 'navigation');
    this.element.setAttribute('aria-label', 'Progress Stepper');

    this.steps = [...opts.steps];
    this.currentStep = opts.activeStep ?? 0;
    this.onStepChange = opts.onStepChange;

    this.render();
  }

  setStep(index: number): void {
    if (index >= 0 && index < this.steps.length && index !== this.currentStep) {
      this.currentStep = index;
      this.render();
      this.onStepChange?.(this.currentStep);
    }
  }

  getStep(): number {
    return this.currentStep;
  }

  private render(): void {
    this.element.innerHTML = this.steps
      .map((step, idx) => {
        const isDone = idx < this.currentStep;
        const isActive = idx === this.currentStep;
        const stateClass = isDone ? 'bs-step-done' : isActive ? 'bs-step-active' : 'bs-step-pending';
        return `
          <div class="bs-step-item ${stateClass}" data-step="${idx}">
            <div class="bs-step-pip">${isDone ? '✓' : idx + 1}</div>
            <div class="bs-step-label">${step.label}</div>
            ${idx < this.steps.length - 1 ? '<div class="bs-step-line"></div>' : ''}
          </div>
        `;
      })
      .join('');

    this.element.querySelectorAll('.bs-step-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-step'));
        if (!isNaN(idx)) this.setStep(idx);
      });
    });
  }
}
