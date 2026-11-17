"use client";

/**
 * React 19 兼容补丁：让 antd-mobile 的命令式弹层（Toast / Dialog / Picker.prompt /
 * ActionSheet 等）重新可用。
 *
 * 背景（v1.20 排查结论）：antd-mobile v5 的提示类 API 都走 renderToBody() →
 * unstableSetRender()（默认实现见 es/utils/unstable-render.js）→ rc-util 的
 * ReactDOM.render/createRoot。而 React 19 把 render/createRoot 从 react-dom
 * 主入口移走了（只剩 react-dom/client），于是 rc-util 里 createRoot 为
 * undefined，render() 退化为 legacyRender()，而 legacyRender 内
 * `reactRender === null || reactRender === undefined || reactRender(...)`
 * 在 reactRender 为 undefined 时直接空操作——弹层不渲染、不报错，用户看到的就是
 * 「点了没反应」。
 *
 * 修法（官方 v5-for-19 指南）：在客户端尽早调用 unstableSetRender，用
 * react-dom/client 的 createRoot 自己渲染，并返回官方约定的异步 unmount。
 * 组件本身不渲染任何东西，只在模块顶层装一次；挂在 app/layout.tsx 的 body 里。
 */

import { unstableSetRender } from "antd-mobile";
import { createRoot, type Root } from "react-dom/client";

/** 每个容器一个 root，避免重复 createRoot（重复调用会告警并丢状态）。 */
const roots = new WeakMap<Element | DocumentFragment, Root>();

if (typeof document !== "undefined") {
  unstableSetRender((node, container) => {
    let root = roots.get(container);
    if (!root) {
      root = createRoot(container);
      roots.set(container, root);
    }
    root.render(node);

    return async () => {
      // 留一帧给弹层的退出动画，再卸载（官方示例同款处理）。
      await new Promise((resolve) => setTimeout(resolve, 0));
      roots.get(container)?.unmount();
      roots.delete(container);
    };
  });
}

export default function AntdMobileReact19Compat() {
  return null;
}
