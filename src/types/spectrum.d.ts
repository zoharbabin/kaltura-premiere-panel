/**
 * Type declarations for Adobe Spectrum Web Components (SWC) used in UXP panels.
 * These are custom elements provided by the UXP runtime — not npm packages.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";

type SpectrumBaseProps = {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  id?: string;
  key?: React.Key;
  ref?: React.Ref<any>;
  title?: string;
  size?: "s" | "m" | "l" | "S" | "M" | "L" | "XS" | "XL" | "small" | "medium" | "large";
  quiet?: boolean;
  disabled?: boolean | undefined;
  variant?: string;
  value?: string | number;
  placeholder?: string;
  type?: string;
  label?: string;
  indeterminate?: boolean;
  selected?: boolean;
  invalid?: boolean;
  onClick?: (e: any) => void;
  onInput?: (e: any) => void;
  onChange?: (e: any) => void;
  onSubmit?: (e: any) => void;
  onKeyDown?: (e: any) => void;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "sp-theme": SpectrumBaseProps & { theme?: string; color?: string; scale?: string };
      "sp-body": SpectrumBaseProps;
      "sp-heading": SpectrumBaseProps;
      "sp-detail": SpectrumBaseProps;
      "sp-button": SpectrumBaseProps;
      "sp-action-button": SpectrumBaseProps;
      "sp-textfield": SpectrumBaseProps;
      "sp-textarea": SpectrumBaseProps;
      "sp-search": SpectrumBaseProps;
      "sp-picker": SpectrumBaseProps;
      "sp-menu-item": SpectrumBaseProps;
      "sp-menu": SpectrumBaseProps;
      "sp-checkbox": SpectrumBaseProps & { checked?: boolean };
      "sp-switch": SpectrumBaseProps & { checked?: boolean };
      "sp-radio": SpectrumBaseProps & { checked?: boolean };
      "sp-radio-group": SpectrumBaseProps;
      "sp-slider": SpectrumBaseProps & { min?: number; max?: number; step?: number };
      "sp-progress-bar": SpectrumBaseProps;
      "sp-progress-circle": SpectrumBaseProps;
      "sp-divider": SpectrumBaseProps;
      "sp-toast": SpectrumBaseProps;
      "sp-dialog": SpectrumBaseProps;
      "sp-icon-alert": SpectrumBaseProps;
      "sp-icon-close": SpectrumBaseProps;
      "sp-icon-search": SpectrumBaseProps;
      "sp-link": SpectrumBaseProps & { href?: string };
      "sp-tab-list": SpectrumBaseProps;
      "sp-tab": SpectrumBaseProps;
      "sp-tab-panel": SpectrumBaseProps;
      "sp-tooltip": SpectrumBaseProps;
      "sp-label": SpectrumBaseProps;
      "sp-number-field": SpectrumBaseProps;
      "sp-field-label": SpectrumBaseProps;
    }
  }
}

export {};
