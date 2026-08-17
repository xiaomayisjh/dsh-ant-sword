import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { RuntimeConfigEditor } from "./RuntimeConfigEditor.js";
import css from './RuntimeStatus.module.css';
const STATE_LABEL = {
    available: '可用',
    configured: '已配置',
    missing: '未安装',
    disabled: '已停用',
};
export const INITIAL_RUNTIME_STATUS = {
    checkedAt: 0,
    skills: { available: 0, provider: 'ant-sword-skills', state: 'ready' },
    mcp: [
        ['kali', 'stdio', 'kali-server-mcp', 'pip install kali-server-mcp', '安装 kali-server-mcp，并确保命令已加入 PATH。'],
        ['metasploit', 'stdio', 'metasploitmcp', 'pip install metasploit-mcp', '安装 Metasploit MCP bridge，并先完成 Metasploit 初始化。'],
        ['hexstrike', 'stdio', 'hexstrike-ai', 'pip install hexstrike-ai', '安装 HexStrike AI MCP 服务并将命令加入 PATH。'],
        ['pentestswarm', 'stdio', 'pentestswarm', 'pip install pentestswarm', '安装 PentestSwarm，并配置编排器 API key。'],
        ['jshook', 'stdio', 'npx', 'npm install -g @jshookmcp/jshook', '需要 Node.js；也可保留 npx 按需下载模式。'],
        ['anything', 'streamable-http', 'http://localhost:23816/mcp', undefined, '启动 AnythingLLM MCP 服务。'],
        ['idapro', 'streamable-http', 'http://127.0.0.1:13337/mcp', undefined, '在 IDA Pro 中启动 MCP 插件。'],
        ['ghidra', 'streamable-http', 'http://localhost:8765/mcp', undefined, '在 Ghidra 中启动 MCP 插件。'],
    ].map(([serverName, transport, target, installCommand, installHint]) => ({
        serverName: serverName,
        transport: transport,
        availability: 'missing',
        mounted: false,
        target: target,
        ...(installCommand === undefined ? {} : { installCommand }),
        installHint: installHint,
    })),
};
const MCP_COMPONENT = {
    jshook: 'jshookmcp',
    idapro: 'idalib-mcp',
    ghidra: 'ghidra-mcp',
};
const EMPTY_INSTALL_VIEW = { components: [], operations: [] };
async function requestInstall(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? `install request failed: ${String(response.status)}`);
    }
}
export function RuntimeStatus({ runtimeStatus, configScope, compact = false }) {
    const snapshot = useSyncExternalStore(onStoreChange => runtimeStatus.subscribe(onStoreChange), () => runtimeStatus.getSnapshot());
    const [installView, setInstallView] = useState(EMPTY_INSTALL_VIEW);
    const [sourcePolicy, setSourcePolicy] = useState('auto');
    const [installError, setInstallError] = useState();
    const available = snapshot.mcp.filter(item => item.availability === 'available' || item.availability === 'configured').length;
    const missing = snapshot.mcp.filter(item => item.availability === 'missing').length;
    useEffect(() => {
        if (compact)
            return;
        let disposed = false;
        const refresh = async () => {
            try {
                const [catalogResponse, statusResponse] = await Promise.all([
                    fetch('/ant-sword/install/catalog', { cache: 'no-store' }),
                    fetch('/ant-sword/install/status', { cache: 'no-store' }),
                ]);
                if (!catalogResponse.ok || !statusResponse.ok)
                    throw new Error('安装状态请求失败');
                const catalog = await catalogResponse.json();
                const status = await statusResponse.json();
                if (!disposed)
                    setInstallView({ components: catalog.components, operations: status.operations });
            }
            catch (error) {
                if (!disposed)
                    setInstallError(error instanceof Error ? error.message : String(error));
            }
        };
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 1_000);
        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, [compact]);
    const startInstall = async (componentId) => {
        setInstallError(undefined);
        try {
            await requestInstall('/ant-sword/install/start', { componentId, sourcePolicy });
        }
        catch (error) {
            setInstallError(error instanceof Error ? error.message : String(error));
        }
    };
    const cancelInstall = async (operationId) => {
        setInstallError(undefined);
        try {
            await requestInstall('/ant-sword/install/cancel', { operationId });
        }
        catch (error) {
            setInstallError(error instanceof Error ? error.message : String(error));
        }
    };
    if (compact) {
        return (_jsxs("div", { className: css.rail, "data-runtime-status": true, children: [_jsxs("span", { className: css.metric, children: ["Skills ", _jsx("strong", { children: snapshot.skills.available })] }), _jsxs("span", { className: css.metric, children: ["MCP ", _jsxs("strong", { children: [available, "/", snapshot.mcp.length] })] }), missing > 0 && _jsxs("span", { className: css.warning, children: [missing, " \u9879\u5F85\u5B89\u88C5"] })] }));
    }
    return (_jsxs("section", { className: css.settings, "data-runtime-settings": true, children: [_jsxs("header", { className: css.settingsHeader, children: [_jsxs("div", { children: [_jsx("h2", { children: "Red Team \u8FD0\u884C\u73AF\u5883" }), _jsx("p", { children: "Skill \u4E0E MCP \u4F7F\u7528\u540C\u4E00\u5B9E\u65F6\u72B6\u6001\u6E90\uFF1B\u7F3A\u5931\u7EC4\u4EF6\u4E0D\u4F1A\u4ECE\u914D\u7F6E\u4E2D\u6D88\u5931\u3002" })] }), _jsxs("div", { className: css.summary, children: [_jsxs("span", { children: ["Skills ", snapshot.skills.available] }), _jsxs("span", { children: ["MCP ", available, "/", snapshot.mcp.length] })] })] }), _jsxs("div", { className: css.installToolbar, children: [_jsxs("label", { children: ["\u4E0B\u8F7D\u6E90", _jsxs("select", { value: sourcePolicy, onChange: (event) => { setSourcePolicy(event.target.value); }, children: [_jsx("option", { value: "auto", children: "\u81EA\u52A8" }), _jsx("option", { value: "domestic-first", children: "\u56FD\u5185\u4F18\u5148" }), _jsx("option", { value: "official-first", children: "\u5B98\u65B9\u4F18\u5148" })] })] }), installError !== undefined && _jsx("span", { className: css.installError, children: installError })] }), _jsxs("div", { className: css.skillCard, "data-state": snapshot.skills.state, children: [_jsx("strong", { children: "Skills" }), _jsx("span", { children: snapshot.skills.state === 'ready' ? `${snapshot.skills.available} 个已发现` : '加载异常' }), _jsx("small", { children: snapshot.skills.error ?? `Provider: ${snapshot.skills.provider}` })] }), _jsx("div", { className: css.grid, children: snapshot.mcp.map(server => (_jsxs("article", { className: css.card, "data-state": server.availability, children: [_jsxs("div", { className: css.cardTitle, children: [_jsx("strong", { children: server.serverName }), _jsxs("span", { children: [STATE_LABEL[server.availability], " \u00B7 ", server.mounted ? '已挂载' : '未挂载'] })] }), _jsx("code", { children: server.target }), _jsx("p", { children: server.installHint }), server.lastProbe !== undefined && _jsxs("details", { children: [_jsxs("summary", { children: ["\u6700\u8FD1\u6D4B\u6D3B\uFF1A", server.lastProbe.toolCount, " \u4E2A\u5DE5\u5177"] }), _jsx("ul", { children: server.lastProbe.tools.map(tool => _jsxs("li", { children: [_jsx("code", { children: `mcp__${server.serverName}__${tool.name}` }), tool.description !== undefined && _jsx("small", { children: tool.description })] }, tool.name)) })] }), server.installCommand !== undefined && _jsx("pre", { children: server.installCommand }), (() => {
                            const componentId = MCP_COMPONENT[server.serverName];
                            if (componentId === undefined)
                                return null;
                            const component = installView.components.find(item => item.id === componentId);
                            const operation = [...installView.operations].reverse().find(item => item.componentId === componentId);
                            const active = operation !== undefined && !['succeeded', 'failed', 'cancelled', 'external-action-required', 'restart-required'].includes(operation.phase);
                            return (_jsxs("div", { className: css.installActions, children: [_jsx("button", { type: "button", disabled: component?.supported !== true || active, onClick: () => { void startInstall(componentId); }, children: operation?.phase === 'failed' ? '重试' : '一键补全' }), active && _jsx("button", { type: "button", onClick: () => { void cancelInstall(operation.id); }, children: "\u53D6\u6D88" }), operation !== undefined && (_jsxs("div", { className: css.installProgress, children: [_jsxs("span", { children: [operation.phase, " \u00B7 ", Math.round(operation.progress * 100), "%"] }), _jsx("progress", { value: operation.progress, max: 1 }), _jsx("small", { children: operation.error ?? operation.logs.at(-1) })] }))] }));
                        })()] }, server.serverName))) }), configScope !== undefined && _jsx(RuntimeConfigEditor, { configScope: configScope })] }));
}
//# sourceMappingURL=RuntimeStatus.js.map