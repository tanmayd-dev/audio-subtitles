import '@testing-library/jest-dom';

// jsdom does not implement scrollIntoView — polyfill it
window.HTMLElement.prototype.scrollIntoView = () => { };

// jsdom does not implement URL.createObjectURL — polyfill it
if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => 'blob:mock-url';
    window.URL.revokeObjectURL = () => { };
}
