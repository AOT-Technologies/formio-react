import { useEffect, useMemo, useRef, useState } from 'react';
import { FormBuilder as FormioFormBuilder, Utils } from '@aot-technologies/formiojs';
import { Component } from '@formio/core';
import structuredClone from '@ungap/structured-clone';

import { FormType, FormSource } from './Form';

interface BuilderConstructor {
	new (
		element: HTMLDivElement,
		formSource: FormSource | undefined,
		options: FormioFormBuilder['options'],
	): FormioFormBuilder;
}
export type FormBuilderProps = {
	options?: FormioFormBuilder['options'];
	Builder?: BuilderConstructor;
	initialForm?: FormSource;
	onBuilderReady?: (builder: FormioFormBuilder) => void;
	onChange?: (form: FormType) => void;
	onSaveComponent?: (
		component: Component,
		parent: Component,
		index: number,
		originalComponentSchema: Component,
		path: string,
		isNew: boolean,
	) => void;
	onAddComponent?: (
		component: Component,
		parent: Component,
		path: string,
		index: number,
	) => void;
	onEditComponent?: (component: Component) => void;
	onUpdateComponent?: (component: Component) => void;
	onDeleteComponent?: (
		component: Component,
		parent: Component,
		path: string,
		index: number,
	) => void;
};

function createCustomConditions(
	component: string,
	operator: string,
	value: string,
	existingCustomConditional: string | undefined,
): string {
	let condition = '';
	switch (operator) {
		case 'isEqual':
			condition = `data.${component} && data.${component} == '${value}'`;
			break;
		case 'isNotEqual':
			condition = `data.${component} && data.${component} != '${value}'`;
			break;
		case 'isEmpty':
			condition = `!data.${component}`;
			break;
		case 'isNotEmpty':
			condition = `!!data.${component}`;
			break;
		case 'includes':
			condition = `data.${component} && data.${component}.includes('${value}')`;
			break;
		case 'notIncludes':
			condition = `data.${component} && !data.${component}.includes('${value}')`;
			break;
		case 'endsWith':
			condition = `data.${component} && data.${component}.endsWith('${value}')`;
			break;
		default:
			break;
	}
	if (existingCustomConditional) {
		if (existingCustomConditional.endsWith(';')) {
			return existingCustomConditional.slice(0, -1) + ' && ' + condition;
		}
		return existingCustomConditional + ' && ' + condition;
	}
	return `show = ${condition}`;
}

function iterateConditionsAndSetLogic(components: any[]): any[] {
	components.forEach((comp) => {
		if (comp?.conditional?.conditions) {
			comp.conditional.conditions.forEach((condition: any) => {
				comp.customConditional = createCustomConditions(
					condition.component,
					condition.operator,
					condition.value,
					comp.customConditional,
				);
			});
		}
		if (comp.customConditional && !comp.customConditional.endsWith(';')) {
			comp.customConditional = comp.customConditional.concat(';');
		}
	});
	return components;
}

// Read the builder's current form safely: guard that the instance is still
// alive (.events is deleted by teardown() on destroy) and that form is truthy.
const readForm = (builderRef: FormioFormBuilder): FormType | undefined => {
	const inst = builderRef.instance;
	if (!inst || !(inst as any).events) return undefined;
	const form = inst.form as FormType | undefined;
	return form ?? undefined;
};

const createBuilderInstance = async (
	BuilderConstructor: BuilderConstructor | undefined,
	formSource: FormSource | undefined,
	element: HTMLDivElement,
	options: FormBuilderProps['options'] = {},
	setBuiderStatus: (
		builder: FormioFormBuilder,
		ready: boolean,
	) => void = () => {},
): Promise<FormioFormBuilder> => {
	const builder = BuilderConstructor
		? new BuilderConstructor(element, formSource, options)
		: new FormioFormBuilder(element, formSource, options);
	setBuiderStatus(builder, false);
	await builder.ready;
	setBuiderStatus(builder, true);
	return builder;
};

export const FormBuilder = ({
	options,
	Builder,
	initialForm,
	onBuilderReady,
	onChange,
	onSaveComponent,
	onAddComponent,
	onEditComponent,
	onUpdateComponent,
	onDeleteComponent,
}: FormBuilderProps) => {
	// Memoize so the useEffect([builderInstance, handlers]) doesn't re-run (and detach/re-attach
	// all 8 formio event listeners) on every parent render. Without this, any parent state
	// change (e.g. a Redux update triggered by onChange) causes needless listener churn.
	const handlers = useMemo(
		() => ({
			onChange,
			onSaveComponent,
			onAddComponent,
			onEditComponent,
			onUpdateComponent,
			onDeleteComponent,
		}),
		[onChange, onSaveComponent, onAddComponent, onEditComponent, onUpdateComponent, onDeleteComponent],
	);
	const renderElement = useRef<HTMLDivElement | null>(null);
	const [builderInstance, setBuilderInstance] =
		useState<FormioFormBuilder | null>(null);
	const isMounted = useRef(false);
	const currentFormSourceJsonProp = useRef<any>(null);
	const pendingBuilder = useRef<FormioFormBuilder | null>(null);

	useEffect(() => {
		return () => {
			if (builderInstance) {
				builderInstance.instance?.destroy(true);
				builderInstance.destroy(true);
			}
		};
	}, [builderInstance]);

	useEffect(() => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, []);

	useEffect(() => {
		if (
			typeof initialForm === 'object' &&
			currentFormSourceJsonProp.current &&
			Utils._.isEqual(currentFormSourceJsonProp.current, initialForm)
		) {
			return;
		}

		const createInstance = async () => {
			if (!renderElement.current) {
				console.warn(
					'FormBuilder render element not found, cannot render builder.',
				);
				return;
			}

			currentFormSourceJsonProp.current =
				initialForm && typeof initialForm !== 'string'
					? structuredClone(initialForm)
					: null;
			// destroy prev builder that is not ready before to create the new one
			if (pendingBuilder.current) {
				const prevBuilder = pendingBuilder.current;
				// wait the prev builder to be ready before destroying it
				await prevBuilder.ready;

				prevBuilder.instance?.destroy(true);
				prevBuilder.destroy(true);
				pendingBuilder.current = null;
			}

			const builder = await createBuilderInstance(
				Builder,
				currentFormSourceJsonProp.current || initialForm,
				renderElement.current,
				options,
				(builder, ready) => {
					pendingBuilder.current = ready ? null : builder;
				},
			);

			if (builder) {
				if (!isMounted.current) {
					builder.instance?.destroy(true);
					builder.destroy(true);
				}

				if (onBuilderReady) {
					onBuilderReady(builder);
				}
				setBuilderInstance((prevInstance: FormioFormBuilder | null) => {
					if (prevInstance) {
						prevInstance.instance?.destroy(true);
						prevInstance.destroy(true);
					}
					return builder;
				});
			} else {
				console.warn('Failed to create form builder instance');
			}
		};

		createInstance();
	}, [Builder, initialForm, onBuilderReady, options]);

	useEffect(() => {
		if (!builderInstance) return;
		const inst = builderInstance.instance;
		// Guard: instance must exist and not yet be destroyed (teardown deletes .events)
		if (!inst || !(inst as any).events) return;

		const {
			onSaveComponent,
			onEditComponent,
			onUpdateComponent,
			onDeleteComponent,
			onChange,
		} = handlers;

		let live = true;

		// Read form safely: check .events (destroyed guard) then the form value itself.
		const guard = () => {
			if (!live) return;
			const form = readForm(builderInstance);
			if (form) {
				if (form.components) {
					form.components = iterateConditionsAndSetLogic(form.components);
				}
				onChange?.(structuredClone(form));
			}
		};

		// Named handler functions — the exact same reference must be passed to both
		// .on() and .off(). Anonymous functions passed to .off() never match the stored
		// listener (compared by reference) so the call is always a no-op.
		const onSaveHandler = (
			component: Component,
			original: Component,
			parent: Component,
			path: string,
			index: number,
			isNew: boolean,
			originalComponentSchema: Component,
		) => {
			if (!live) return;
			onSaveComponent?.(component, parent, index, originalComponentSchema, path, isNew);
			guard();
		};
		const onUpdateHandler = (component: Component) => {
			if (!live) return;
			onUpdateComponent?.(component);
			guard();
		};
		const onRemoveHandler = (component: Component, parent: Component, path: string, index: number) => {
			if (!live) return;
			onDeleteComponent?.(component, parent, path, index);
			guard();
		};
		const onCancelHandler = (component: Component) => {
			if (!live) return;
			onUpdateComponent?.(component);
			guard();
		};
		const onEditHandler = (component: Component) => {
			if (!live) return;
			onEditComponent?.(component);
			// Do NOT call onChange here: opening the edit modal does not mutate the form schema.
			// Firing onChange here triggers an unnecessary Redux update + React re-render on every
			// component click and every drag-drop, causing visible lag.
		};
		const onAddHandler = () => { if (!live) return; guard(); };
		const onPdfHandler = () => { if (!live) return; guard(); };
		const onDisplayHandler = () => { if (!live) return; guard(); };

		inst.on('saveComponent', onSaveHandler);
		inst.on('updateComponent', onUpdateHandler);
		inst.on('removeComponent', onRemoveHandler);
		inst.on('cancelComponent', onCancelHandler);
		inst.on('editComponent', onEditHandler);
		inst.on('addComponent', onAddHandler);
		inst.on('pdfUploaded', onPdfHandler);
		inst.on('setDisplay', onDisplayHandler);

		return () => {
			live = false;
			inst.off('saveComponent', onSaveHandler);
			inst.off('updateComponent', onUpdateHandler);
			inst.off('removeComponent', onRemoveHandler);
			inst.off('cancelComponent', onCancelHandler);
			inst.off('editComponent', onEditHandler);
			inst.off('addComponent', onAddHandler);
			inst.off('pdfUploaded', onPdfHandler);
			inst.off('setDisplay', onDisplayHandler);
		};
	}, [builderInstance, handlers]);

	return <div ref={renderElement}></div>;
};
