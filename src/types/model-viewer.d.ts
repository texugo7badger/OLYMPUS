/** The @google/model-viewer custom element — React needs the JSX declaration
 *  (the package ships web-component types; this is the React bridge). */
import type { JSX } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': any;
    }
  }
}
