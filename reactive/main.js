/* 
proxy 可以代理所有对象，不用刻意去处理 数组和 对象的添加和删除  $set

Object.defineProperty  

*/

const baseHandler = {
  get: function (target, key) {
    let res = Reflect.get(target, key)
    //依赖收集
    track(target, key)
    return typeof res === 'object' ? reactive(res) : res
  },
  set: function (target, key, value) {
    if (target[key] === value) return false
    const info = {
      oldValue: target[key],
      newValue: value,
    }
    Reflect.set(target, key, value)
    // 响应式的通知变化  触发依赖  值改变 触发依赖函数
    trigger(target, key, info)
  },
}

function reactive(target) {
  const observed = new Proxy(target, baseHandler) //将传入的对象 reactive化（可响应式）
  //返回响应后的对象
  return observed
}
//怎么收集依赖  用一个巨大的map来收集
/* 
map {
  target1: {
    key: [包装后的依赖收集函数1， 包装后的依赖收集函数2]
  }
  target2: {
    key: [包装后的依赖收集函数1， 包装后的依赖收集函数2]
  }
}
*/
let targetMap = new WeakMap()
function track(target, key) {
  //收集依赖
  const effect = effectStack[effectStack.length - 1] // 获取最新的依赖函数
  if (effect) {
    //判断最初的targetMap 是不是空的 或者 我们的target对象是不是已经收集过
    let depMap = targetMap.get(target)
    if (!depMap) {
      //不存在 就初始化
      depMap = new Map()
      targetMap.set(target, depMap)
    }
    let dep = depMap.get(key)
    if (!dep) {
      dep = new Set() // 对应的key值为一个数组，因此可以采用set，同时还可以去重
      depMap.set(key, dep)
    }
    if (!dep.has(effect)) {
      //新增依赖
      //双向存储  方便查找优化
      dep.add(effect)
      effect.deps.push(dep)
    }
  }
}

/* 
  [effectHandler1, effectHandler2]
*/
// 存储effect
let effectStack = []

// 依赖函数
function effect(fn, option = {}) {
  let e = createReactiveEffect(fn, option)
  if (!option.lazy) {
    // 不是懒执行  就立刻执行
    e()
  }
  return e
}
function createReactiveEffect(fn, option) {
  //构造固定格式的effect
  const effect = function effect(...args) {
    return run(effect, fn, args)
  }
  effect.deps = []
  effect.computed = option.computed
  effect.lazy = option.lazy
  return effect
}
function run(effect, fn, args) {
  //执行effect
  let effectIndex = effectStack.indexOf(effect)
  if (effectIndex === -1) {
    try {
      effectStack.push(effect)
      return fn(...args)
    } finally {
      effectStack.pop() // effect 执行完毕  pop依赖函数
    }
  }
}
// 特殊effect  option中参数 computed 为true
function computed(fn) {
  const runner = effect(fn, { lazy: true, computed: true })
  return {
    effect: runner,
    get value() {
      return runner()
    },
  }
}

function trigger(target, key, info) {
  // 执行effect
  //1. 找到依赖
  const depMap = targetMap.get(target)
  if (!depMap) {
    return
  }
  //分开 effect 和 computed  ， effect先执行，computed后执行  ， computed 可能会依赖普通effect
  const effects = new Set()
  const computedRunners = new Set()
  if (key) {
    let deps = depMap.get(key)
    deps.forEach((dep) => {
      if (dep.computed) {
        computedRunners.add(dep)
      } else {
        effects.add(dep)
      }
    })
    effects.forEach((effect) => effect())
    computedRunners.forEach((effect) => effect())
  }
}
