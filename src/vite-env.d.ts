/// <reference types="vite/client" />

// Add support for importing JSON files
declare module '*.json' {
  const value: any;
  export default value;
}
