/********************************************************************************
 * Copyright (c) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import {
    ELK, ElkNode, ElkGraphElement, ElkEdge, ElkLabel, ElkPort, ElkShape, ElkPrimitiveEdge,
    ElkExtendedEdge, LayoutOptions
} from 'elkjs/lib/elk-api';
import { SGraphSchema, SNodeSchema, SEdgeSchema, SLabelSchema, SPortSchema } from 'sprotty/lib/graph/sgraph';
import { SModelElementSchema, SModelIndex } from 'sprotty/lib/base/model/smodel';
import { getBasicType } from 'sprotty/lib/base/model/smodel-utils';
import { IModelLayoutEngine } from 'sprotty/lib/model-source/local-model-source';
import { SShapeElementSchema } from 'sprotty/lib/features/bounds/model';
import { Point } from 'sprotty/lib/utils/geometry';

export const ElkFactory = Symbol('ElkFactory');
export const IElementFilter = Symbol('IElementFilter');
export const ILayoutConfigurator = Symbol('ILayoutConfigurator');

/**
 * Layout engine that delegates to ELK by transforming the Sprotty graph into an ELK graph.
 */
@injectable()
export class ElkLayoutEngine implements IModelLayoutEngine {

    protected readonly elk: ELK;

    constructor(@inject(ElkFactory) elkFactory: ElkFactory,
                @inject(IElementFilter) protected readonly filter: IElementFilter,
                @inject(ILayoutConfigurator) protected readonly configurator: ILayoutConfigurator) {
        this.elk = elkFactory();
    }

    layout(graph: SGraphSchema, index?: SModelIndex<SModelElementSchema>): SGraphSchema | Promise<SGraphSchema> {
        if (getBasicType(graph) !== 'graph') {
            return graph;
        }
        if (!index) {
            index = new SModelIndex();
            index.add(graph);
        }
        const elkGraph = this.transformToElk(graph, index) as ElkNode;
        return this.elk.layout(elkGraph).then(result => {
            this.applyLayout(result, index!);
            return graph;
        });
    }

    protected transformToElk(smodel: SModelElementSchema, index: SModelIndex<SModelElementSchema>): ElkGraphElement {
        switch (getBasicType(smodel)) {
            case 'graph': {
                const sgraph = smodel as SGraphSchema;
                const elkGraph: ElkNode = {
                    id: sgraph.id,
                    layoutOptions: this.configurator.apply(sgraph, index)
                };
                if (sgraph.children) {
                    elkGraph.children = sgraph.children
                        .filter(c => getBasicType(c) === 'node' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkNode[];
                    elkGraph.edges = sgraph.children
                        .filter(c => getBasicType(c) === 'edge' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkEdge[];
                }
                return elkGraph;
            }

            case 'node': {
                const snode = smodel as SNodeSchema;
                const elkNode: ElkNode = {
                    id: snode.id,
                    layoutOptions: this.configurator.apply(snode, index)
                };
                if (snode.children) {
                    elkNode.children = snode.children
                        .filter(c => getBasicType(c) === 'node' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkNode[];
                    elkNode.edges = snode.children
                        .filter(c => getBasicType(c) === 'edge' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkEdge[];
                    elkNode.labels = snode.children
                        .filter(c => getBasicType(c) === 'label' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkLabel[];
                    elkNode.ports = snode.children
                        .filter(c => getBasicType(c) === 'port' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkPort[];
                }
                this.transformShape(elkNode, snode);
                return elkNode;
            }

            case 'edge': {
                const sedge = smodel as SEdgeSchema;
                const elkEdge: ElkPrimitiveEdge = {
                    id: sedge.id,
                    source: sedge.sourceId,
                    target: sedge.targetId,
                    layoutOptions: this.configurator.apply(sedge, index)
                };
                const sourceElement = index.getById(sedge.sourceId);
                if (sourceElement && getBasicType(sourceElement) === 'port') {
                    const parent = index.getParent(sourceElement.id);
                    if (parent && getBasicType(parent) === 'node') {
                        elkEdge.source = parent.id;
                        elkEdge.sourcePort = sourceElement.id;
                    }
                }
                const targetElement = index.getById(sedge.targetId);
                if (targetElement && getBasicType(targetElement) === 'port') {
                    const parent = index.getParent(targetElement.id);
                    if (parent && getBasicType(parent) === 'node') {
                        elkEdge.target = parent.id;
                        elkEdge.targetPort = targetElement.id;
                    }
                }
                if (sedge.children) {
                    elkEdge.labels = sedge.children
                        .filter(c => getBasicType(c) === 'label' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkLabel[];
                }
                const points = sedge.routingPoints;
                if (points && points.length >= 2) {
                    elkEdge.sourcePoint = points[0];
                    elkEdge.bendPoints = points.slice(1, points.length - 1);
                    elkEdge.targetPoint = points[points.length - 1];
                }
                return elkEdge;
            }

            case 'label': {
                const slabel = smodel as SLabelSchema;
                const elkLabel: ElkLabel = {
                    id: slabel.id,
                    text: slabel.text,
                    layoutOptions: this.configurator.apply(slabel, index)
                };
                this.transformShape(elkLabel, slabel);
                return elkLabel;
            }

            case 'port': {
                const sport = smodel as SPortSchema;
                const elkPort: ElkPort = {
                    id: sport.id,
                    layoutOptions: this.configurator.apply(sport, index)
                };
                if (sport.children) {
                    elkPort.labels = sport.children
                        .filter(c => getBasicType(c) === 'label' && this.filter.apply(c, index))
                        .map(c => this.transformToElk(c, index)) as ElkLabel[];
                }
                this.transformShape(elkPort, sport);
                return elkPort;
            }

            default:
                throw new Error('Type not supported: ' + smodel.type);
        }
    }

    protected transformShape(elkShape: ElkShape, sshape: SShapeElementSchema): void {
        if (sshape.position) {
            elkShape.x = sshape.position.x;
            elkShape.y = sshape.position.y;
        }
        if (sshape.size) {
            elkShape.width = sshape.size.width;
            elkShape.height = sshape.size.height;
        }
    }

    protected applyLayout(elkNode: ElkNode, index: SModelIndex<SModelElementSchema>): void {
        const snode = index.getById(elkNode.id);
        if (snode && getBasicType(snode) === 'node') {
            this.applyShape(snode as SNodeSchema, elkNode, index);
        }
        if (elkNode.children) {
            for (const child of elkNode.children) {
                this.applyLayout(child, index);
            }
        }
        if (elkNode.edges) {
            for (const elkEdge of elkNode.edges) {
                const sedge = index.getById(elkEdge.id);
                if (sedge && getBasicType(sedge) === 'edge') {
                    this.applyEdge(sedge as SEdgeSchema, elkEdge, index);
                }
            }
        }
        if (elkNode.ports) {
            for (const elkPort of elkNode.ports) {
                const sport = index.getById(elkPort.id);
                if (sport && getBasicType(sport) === 'port') {
                    this.applyShape(sport as SPortSchema, elkPort, index);
                }
            }
        }
    }

    protected applyShape(sshape: SShapeElementSchema, elkShape: ElkShape, index: SModelIndex<SModelElementSchema>): void {
        if (elkShape.x !== undefined && elkShape.y !== undefined)
            sshape.position = { x: elkShape.x, y: elkShape.y };
        if (elkShape.width !== undefined && elkShape.height !== undefined)
            sshape.size = { width: elkShape.width, height: elkShape.height };

        if (elkShape.labels) {
            for (const elkLabel of elkShape.labels) {
                const slabel = index.getById(elkLabel.id);
                if (slabel) {
                    this.applyShape(slabel as SLabelSchema, elkLabel, index);
                }
            }
        }
    }

    protected applyEdge(sedge: SEdgeSchema, elkEdge: ElkEdge, index: SModelIndex<SModelElementSchema>): void {
        const points: Point[] = [];
        if ((elkEdge as any).sections && (elkEdge as any).sections.length > 0) {
            const section = (elkEdge as ElkExtendedEdge).sections[0];
            if (section.startPoint)
                points.push(section.startPoint);
            if (section.bendPoints)
                points.push(...section.bendPoints);
            if (section.endPoint)
                points.push(section.endPoint);
        } else {
            const section = elkEdge as ElkPrimitiveEdge;
            if (section.sourcePoint)
                points.push(section.sourcePoint);
            if (section.bendPoints)
                points.push(...section.bendPoints);
            if (section.targetPoint)
                points.push(section.targetPoint);
        }
        sedge.routingPoints = points;

        if (elkEdge.junctionPoints) {
            sedge.children = sedge.children ?? [];
            elkEdge.junctionPoints.forEach((jp, i) => {
                const sJunction = <SNodeSchema> {
                    type: 'junction',
                    id: elkEdge.id + "_j" + i,
                    position: jp
                };
                sedge.children?.push(sJunstion)
            });
        }

        if (elkEdge.labels) {
            elkEdge.labels.forEach((elkLabel) => {
                const sLabel = index.getById(elkLabel.id);
                if (sLabel) {
                    this.applyShape(sLabel, elkLabel, index);
                }
            });
        }
    }

}

/**
 * Factory for ELK instances. Follow the elkjs package documentation on how to configure ELK
 * instances. For example, the bundled version can be used by importing the ELK constructor
 * from `"elkjs/lib/elk.bundled"`. For the webworker version, import the constructor from
 * `"elkjs/lib/elk-api"` and add the option `workerUrl: "elk/elk-worker.min.js"`.
 */
export type ElkFactory = () => ELK;

/**
 * Filter used to determine which model elements should be included in the automatic layout.
 */
export interface IElementFilter {
    apply(element: SModelElementSchema, index: SModelIndex<SModelElementSchema>): boolean
}

@injectable()
export class DefaultElementFilter implements IElementFilter {

    apply(element: SModelElementSchema, index: SModelIndex<SModelElementSchema>): boolean {
        switch (getBasicType(element)) {
            case 'node':
                return this.filterNode(element as SNodeSchema, index);
            case 'edge':
                return this.filterEdge(element as SEdgeSchema, index);
            case 'label':
                return this.filterLabel(element as SLabelSchema, index);
            case 'port':
                return this.filterPort(element as SPortSchema, index);
            default:
                return true;
        }
    }

    protected filterNode(node: SNodeSchema, index: SModelIndex<SModelElementSchema>): boolean {
        return true;
    }

    protected filterEdge(edge: SEdgeSchema, index: SModelIndex<SModelElementSchema>): boolean {
        const source = index.getById(edge.sourceId);
        if (!source)
            return false;
        const sourceType = getBasicType(source);
        if (sourceType === 'node' && !this.filterNode(source, index)
            || sourceType === 'port' && !this.filterPort(source, index))
            return false;
        const target = index.getById(edge.targetId);
        if (!target)
            return false;
        const targetType = getBasicType(target);
        if (targetType === 'node' && !this.filterNode(target, index)
            || targetType === 'port' && !this.filterPort(target, index))
            return false;
        return true;
    }

    protected filterLabel(label: SLabelSchema, index: SModelIndex<SModelElementSchema>): boolean {
        return true;
    }

    protected filterPort(port: SPortSchema, index: SModelIndex<SModelElementSchema>): boolean {
        return true;
    }

}

/**
 * Configurator of layout algorithms; provides mappings of layout options for each model element.
 */
export interface ILayoutConfigurator {
    apply(element: SModelElementSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined
}

@injectable()
export class DefaultLayoutConfigurator implements ILayoutConfigurator {

    apply(element: SModelElementSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined {
        switch (getBasicType(element)) {
            case 'graph':
                return this.graphOptions(element as SGraphSchema, index);
            case 'node':
                return this.nodeOptions(element as SNodeSchema, index);
            case 'edge':
                return this.edgeOptions(element as SEdgeSchema, index);
            case 'label':
                return this.labelOptions(element as SLabelSchema, index);
            case 'port':
                return this.portOptions(element as SPortSchema, index);
            default:
                return undefined;
        }
    }

    protected graphOptions(sgraph: SGraphSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined {
        return undefined;
    }

    protected nodeOptions(snode: SNodeSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined {
        return undefined;
    }

    protected edgeOptions(sedge: SEdgeSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined {
        return undefined;
    }

    protected labelOptions(slabel: SLabelSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined {
        return undefined;
    }

    protected portOptions(sport: SPortSchema, index: SModelIndex<SModelElementSchema>): LayoutOptions | undefined {
        return undefined;
    }

}
