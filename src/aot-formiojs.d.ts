// Type shim: @aot-technologies/formiojs is a runtime fork of @formio/js.
// At build time, TypeScript resolves its types from @formio/js (devDependency).
declare module '@aot-technologies/formiojs' {
	export * from '@formio/js';
}
declare module '@aot-technologies/formiojs/utils' {
	export * from '@formio/js/utils';
}
declare module '@aot-technologies/formiojs/lib' {
	export * from '@formio/js';
}
