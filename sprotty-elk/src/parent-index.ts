/********************************************************************************
 * Copyright (c) 2020 TypeFox and others.
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

import { SModelElementSchema, SModelIndex } from "sprotty/lib/base/model/smodel";

export class SModelIndexWithParent<E extends SModelElementSchema> extends SModelIndex<E> {

    private id2parent: Map<string, E> = new Map();

    add(element: E): void {
        super.add(element);
        if (element.children !== undefined && element.children.constructor === Array) {
            for (const child of element.children) {
                this.id2parent.set(child.id, element);
            }
        }
    }

    remove(element: E): void {
        if (element.children !== undefined && element.children.constructor === Array) {
            for (const child of element.children) {
                this.id2parent.delete(child.id);
            }
        }
        super.remove(element);
    }

    getParent(id: string): E | undefined {
        return this.id2parent.get(id);
    }

}
