import { effects, containerStack } from "./util";
import { updateEffects } from "./beginWork";
import { collectEffects, getContainer } from "./completeWork";
import { commitEffects } from "./commitWork";
import { CALLBACK } from "./effectTag";
import { Renderer } from "react-core/createRenderer";
import { __push, get } from "react-core/util";
let updateQueue = Renderer.mainThread;
window.Renderer = Renderer;
let batchedCbs = [];
export function render(vnode, root, callback) {
    let hostRoot = Renderer.updateRoot(root), instance = null;
    // 如果组件的componentDidMount/Update中调用ReactDOM.render
    if (hostRoot._hydrating) {
        hostRoot.pendingCbs.push(function () {
            render(vnode, root, callback);
        });
        return;
    }
    hostRoot.props = {
        children: vnode
    };
    hostRoot.pendingCbs = [function () {
        instance = hostRoot.child ? hostRoot.child.stateNode : null;
        callback && callback.call(instance);
        hostRoot._hydrating = false; // unlock
    }];

    hostRoot.effectTag = CALLBACK;
    //如果在ReactDOM.batchedUpdates中调用ReactDOM.render
    if (isBatchingUpdates) {
        if (get(root)) { //如果是旧节点
            batchedCbs.push(function () {
                render(vnode, root, callback);
            });
            return;
        }
    }
    hostRoot._hydrating = true; // lock 表示正在渲染
    updateQueue.push(hostRoot);
    if (!Renderer.isRendering) {
        Renderer.scheduleWork();
    }
    return instance;
}

Renderer.scheduleWork = function () {
    performWork({
        timeRemaining() {
            return 2;
        }
    });
};

var isBatchingUpdates = false;
Renderer.batchedUpdates = function (cb) {
    var keepbook = isBatchingUpdates;
    isBatchingUpdates = true;
    try {
        cb();       
    } finally {
        isBatchingUpdates = keepbook;
        if (!isBatchingUpdates) {
            batchedCbs.forEach(fn => fn());
            batchedCbs.length = 0;
            Renderer.scheduleWork();
        }
    }
};

function workLoop(deadline) {
    let topWork = getNextUnitOfWork();
    if (topWork) {
        let fiber = topWork;
        let p = getContainer(fiber);
        if (p) {
            containerStack.unshift(p);
        }
        while (fiber && deadline.timeRemaining() > ENOUGH_TIME) {
            fiber = updateEffects(fiber, topWork);
        }
        if (topWork) {
            __push.apply(effects, collectEffects(topWork, null, true));
            if (topWork.effectTag) {
                effects.push(topWork);
            }
        }
        if (deadline.timeRemaining() > ENOUGH_TIME && updateQueue.length) {
            workLoop(deadline);
        } else {
            commitEffects();
        }
    }
}

function performWork(deadline) {
    workLoop(deadline);
    if (updateQueue.length > 0) {
        requestIdleCallback(performWork);
    }
}



let ENOUGH_TIME = 1;
function requestIdleCallback(fn) {
    fn({
        timeRemaining() {
            return 2;
        }
    });
}
let roots = [];
function getNextUnitOfWork(fiber) {
    while (roots.length) {
        var el = roots.shift();
        __push.apply(updateQueue, el.batchedQueue);
        delete el.batchedQueue;
    }
    fiber = updateQueue.shift();
    if (!fiber || fiber.merged) {
        return;
    }
    if (fiber.root) {
        fiber.stateNode = fiber.stateNode || {};
        if (!get(fiber.stateNode)) {
            Renderer.emptyElement(fiber);
        }
        fiber.stateNode._reactInternalFiber = fiber;
    }
    return fiber;
}

/**
 * 这是一个深度优先过程，beginWork之后，对其孩子进行任务收集，然后再对其兄弟进行类似操作，
 * 没有，则找其父节点的孩子
 * @param {Fiber} fiber 
 * @param {Fiber} topWork 
 */

function mergeUpdates(el, state, isForced, callback) {
    var fiber = el._updates || el;
    if (isForced) {
        fiber.isForced = true; // 如果是true就变不回false
    }
    if (state) {
        var ps = fiber.pendingStates || (fiber.pendingStates = []);
        ps.push(state);
    }
    if (callback) {
        var cs = fiber.pendingCbs || (fiber.pendingCbs = []);
        if (!cs.length) {
            if (!fiber.effectTag) {
                fiber.effectTag = CALLBACK;
            } else {
                fiber.effectTag *= CALLBACK;
            }

        }
        cs.push(callback);
    }
}
function getRoot(el) {
    while (el.return) {
        el = el.return;
    }
    return el;
}

Renderer.updateComponent = function (instance, state, callback) {
    // setState
    let fiber = get(instance);
    if (fiber.parent) {
        fiber.parent.insertPoint = fiber.insertPoint;
    }
    let isForced = state === true;
    state = isForced ? null : state;
    let updater = instance.updater, batchedQueue;
    if (isBatchingUpdates) {
        let root = updater.root || (updater.root = getRoot(fiber));
        if (!root.batchedQueue) {
            roots.push(root);
        }
        batchedQueue = root.batchedQueue || (root.batchedQueue = []);
    }
    if (this._hydrating || batchedQueue) {
        // 如果正在render过程中，那么要新建一个fiber,将状态添加到新fiber
        if (!fiber._updates) {
            fiber._updates = {};
            var queue = batchedQueue || updateQueue;
            queue.push(fiber);
        }
        mergeUpdates(fiber, state, isForced, callback);
    } else {
        // 如果是在componentWillXXX中，那么直接修改已经fiber及instance
        mergeUpdates(fiber, state, isForced, callback);
        if (!this._hooking && !isBatchingUpdates) {
            // 不在生命周期钩子中时，需要立即触发（或异步触发）
            updateQueue.push(fiber);
            Renderer.scheduleWork();
        }
    }
};
