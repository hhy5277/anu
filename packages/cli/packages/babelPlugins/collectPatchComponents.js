let config = require('../config');
const path = require('path');
const cwd = process.cwd();
const utils = require('../utils/index');
/**
 * patchComponents用于搜集文件中的patch components
 * {
 *     patchComponents: ['button', 'radio'],
 *     jsxPatchNode: {
 *       [fileId]: ['button']
 *     }
 * }
 */

function getPatchComponentPath(name) {
    return path.resolve(cwd, `./node_modules/schnee-ui/components/${name}/index.js`);
}

module.exports = ()=>{
    return {
        visitor: {
            JSXOpeningElement: function(astPath, state){
                // [babel 6 to 7] 通过 state 来获取文件的绝对路径 fileId =  state.filename
                let fileId =  state.filename;
                let nodeName = astPath.node.name.name;
                let platConfig = config[config.buildType];
                let patchComponents = platConfig.patchComponents || [];
                
                if ( !patchComponents.includes(nodeName) ) return;
                // 添加依赖的补丁组件
                const patchComponentPath = getPatchComponentPath('X' + utils.parseCamel(nodeName));
                config.patchComponents[nodeName] = config.patchComponents[nodeName] || patchComponentPath;
                //做一些初始化工作
                platConfig.jsxPatchNode = platConfig.jsxPatchNode || {};
                platConfig.jsxPatchNode[fileId] = platConfig.jsxPatchNode[fileId] || [];

                //防止重复添加
                if (platConfig.jsxPatchNode[fileId].includes(nodeName)) return;
                platConfig.jsxPatchNode[fileId].push(nodeName);
                
            }
        }
    };
};