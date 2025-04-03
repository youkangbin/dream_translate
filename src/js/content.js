'use strict'

/**
 * Dream Translate
 * https://github.com/ryanker/dream_translate
 * @Author Ryan <dream39999@gmail.com>
 * @license MIT License
 */

let isPopup = window.isPopup
let isFullscreen, isClipboardRead, isSome
let dialog, shadow,
    setting, conf, dialogConf,
    languageList, dialogCSS = '', dictionaryCSS = {},
    iconBut, iconText,
    msgList = {},
    root = B.root
let dQuery = {action: '', text: '', source: '', target: ''}
let textTmp = ''
let history = [], historyIndex = 0, disHistory = false
let searchText
document.addEventListener('DOMContentLoaded', async function () {
    let u = new URL(location.href)
    isFullscreen = u.searchParams.get('fullscreen') === '1'
    isClipboardRead = u.searchParams.get('clipboardRead') === '1'
    isSome = location.href.indexOf(root) === 0

    await storageLocalGet(['conf', 'languageList', 'dialogCSS', 'dictionaryCSS']).then(function (r) {
        conf = r.conf
        languageList = JSON.parse(r.languageList)
        dialogCSS = r.dialogCSS
        dictionaryCSS = r.dictionaryCSS
    })

    await storageSyncGet(['setting', 'dialogConf', 'searchText']).then(function (r) {
        setting = r.setting
        dialogConf = Object.assign({}, conf.dialogConf, r.dialogConf)
        searchText = r.searchText
    })

    // 初始对话框
    initDialog()

    // 初始对话框CSS
    initDictionaryCSS()

    // 是否开启自动解除选中现在
    if (setting.allowSelect === 'on' && !isSome) allowUserSelect()

    // 查看全部数据
    storageShowAll()
})

// 监听消息
B.onMessage.addListener(function (m, sender, sendResponse) {
    sendResponse()
    debug('request:', m)
    // debug('sender:', sender)
    if (m.action === 'translate') {
        msgList[m.name] = m.result
        resultTranslate(m.name)
    } else if (m.action === 'dictionary') {
        resultDictionary(m)
    } else if (m.action === 'playSound') {
        resultSound(m)
    } else if (m.action === 'link') {
        resultLink(m)
    } else if (m.action === 'allowSelect') {
        allowUserSelect()
    } else if (m.action === 'onCrop') {
        initCrop()
    } else if (m.action === 'onAlert') {
        dmxAlert(m.message, m.type)
    } else if (m.action === 'contextMenus') {
        sendQuery(m.text) // 右键查询
        showDialog()
    }
})

// 监听 frame 消息
window.addEventListener("message", function (m) {
    let d = m.data
    if (d.text && typeof d.clientX === 'number' && typeof d.clientY === 'number') initQuery(d.text, d.clientX, d.clientY)
})

// 监听设置修改
B.storage.onChanged.addListener(function (data) {
    let keys = Object.keys(data)
    keys.forEach(k => {
        let v = data[k].newValue
        if (k === 'setting') {
            setting = v
            debug('new setting:', v)

            // 初始对话框CSS
            initDictionaryCSS()
        } else if (k === 'searchText') {
            searchText = v
            debug('new searchText:', v)
        }
    })
})

// 初始对话框
function initDialog() {
    let isChange = false
    let options = {
        cssText: dialogCSS,
        width: dialogConf.width,
        height: dialogConf.height,
        minWidth: 450,
        onResize: function (style) {
            const {width, height} = style
            if (width) dialogConf.width = width
            if (height) dialogConf.height = height
            isChange = true
        }
    }
    if (isPopup) {
        options.width = 'auto'
        options.height = 'auto'
        options.show = true
        options.autoHide = false
        options.isMove = false
        options.isResize = false
        options.onResize = null
    }
    dialog = dmxDialog(options)

    // 保存窗口大小
    dialog.el.addEventListener('mouseup', function () {
        if (isChange) {
            saveDialogConf()
            isChange = false
        }
    })

    // 影子元素
    shadow = dialog.shadow

    // 小屏窗口
    if (isPopup) {
        addClass(dialog.el, 'dmx_popup')
        isFullscreen ? addClass(dialog.el, 'fullscreen') : addClass(document.documentElement, 'dmx_popup')
        A('#dmx_close,#dmx_pin,#dmx_fullscreen').forEach(e => e.remove())
        if (B.getBackgroundPage) textTmp = B.getBackgroundPage().textTmp // 读取后台缓存
    }

    // 划词查询
    document.addEventListener('mouseup', function (e) {
        let text = window.getSelection().toString().trim()
        initQuery(text, e.clientX, e.clientY)
    })

    // 鼠标图标
    iconBut = I('dmx_mouse_icon')
    iconBut.onclick = function (e) {
        iconBut.style.display = 'none'
        autoChangeAction(iconText)
        sendQuery(iconText)  // 点击图标查询
        showDialog(e.clientX + 10, e.clientY - 35)
    }
    iconBut.onmousedown = function (e) {
        e.preventDefault()
    }

    // 绑定事件
    let nav = I('dmx_navigate')
    let uEl = nav.querySelectorAll('u')
    uEl.forEach(e => {
        e.addEventListener('click', function () {
            let action = this.getAttribute('action')
            if (!['translate', 'dictionary', 'search'].includes(action)) return
            if (dQuery.action === action) return
            rmClassD(uEl, 'active')
            addClass(this, 'active')
            setDialogConf('action', action) // 保存设置
            if (action === 'translate') {
                initTranslate()
            } else if (action === 'dictionary') {
                initDictionary()
            } else if (action === 'search') {
                initSearch()
            }
            sendQuery(dQuery.text) // 切换导航查询
        })
    })

    // 初始模块
    let action = dialogConf.action
    if (action) {
        if (!['translate', 'dictionary', 'search'].includes(action)) action = 'translate'
        let actionEl = nav.querySelector(`u[action="${action}"]`)
        if (actionEl) actionEl.click()
    }

    // 设置按钮
    I('dmx_setting').addEventListener('click', function () {
        rmClassD(uEl, 'active')
        initSetting()
        dQuery.action = 'setting'
    })

    // 更多功能
    I('dmx_more').addEventListener('click', function () {
        rmClassD(uEl, 'active')
        initMore()
        dQuery.action = 'more'
    })

    // 录音练习
    I('dmx_voice').addEventListener('click', function () {
        sendMessage({action: 'onRecord'})
    })

    // 鼠标停留取词
    document.addEventListener('mousemove', (e) => {
        if (setting.autoWords && setting.scribble !== 'off') _setTimeout('_mouseWords', () => mouseWords(e), 300)
    })

    // 历史记录
    let hEl = I('dmx_history')
    let hlEl = hEl.querySelector('.dmx-icon-left')
    let hrEl = hEl.querySelector('.dmx-icon-right')
    let loadHistory = function (index) {
        if (index < 0 || index >= history.length) return
        disHistory = true
        historyIndex = index

        let className = 'disabled'
        rmClass(hlEl, className)
        rmClass(hrEl, className)
        if (index === 0) {
            addClass(hlEl, className)
        } else if (index === history.length - 1) {
            addClass(hrEl, className)
        }

        let data = history[index]
        debug('current:', historyIndex, data, history)
        let action = data.action
        let text = data.text
        dialogConf.action = action
        dialogConf.source = data.source
        dialogConf.target = data.target
        dQuery.action !== action && setDialogConf('action', action) // 保存设置
        rmClassD(uEl, 'active')
        addClass(nav.querySelector(`u[action="${action}"]`), 'active')
        if (action === 'translate') {
            initTranslate()
        } else if (action === 'dictionary') {
            initDictionary()
        } else if (action === 'search') {
            initSearch()
        }
        sendQuery(text) // 历史记录查询
    }
    hlEl.addEventListener('click', () => loadHistory(historyIndex - 1))
    hrEl.addEventListener('click', () => loadHistory(historyIndex + 1))
}

function initTranslate() {
    let l = languageList, langList = ''
    for (let k in l) {
        if (l.hasOwnProperty(k)) langList += `<u value="${k}">${l[k].zhName}</u>`
    }
    dialog.contentHTML(`<div class="dmx_main dmx_main_trans">
    <div class="case${isPopup || isFullscreen ? ' big' : ''}" id="translate_input" contenteditable="true"></div>
    <div class="language_box fx">
        <div id="language_source" class="language_button dmx-icon"></div>
        <div id="language_exchange"><i class="dmx-icon dmx-icon-exchange"></i></div>
        <div id="language_target" class="language_button dmx-icon"></div>
        <div id="translate_button">翻 译</div>
        <div id="translate_crop"><i class="dmx-icon dmx-icon-crop"></i></div>
        <div id="language_dropdown" class="fx">${langList}</div>
    </div>
</div>
<div id="case_list" class="dmx_main fx"></div>`)

    // 绑定事件
    let sourceEl = I('language_source')
    let targetEl = I('language_target')
    let exchangeEl = I('language_exchange')
    let inputEl = I('translate_input')
    let translateEl = I('translate_button')
    let cropEl = I('translate_crop')
    let dropdownEl = I('language_dropdown')
    let dropdownU = dropdownEl.querySelectorAll('u')
    let contentEl = I('dmx_dialog_content')
    let tmpEl
    let onButton = function () {
        let el = this
        if (tmpEl === el && dropdownEl.style.display === 'block') {
            dropdownEl.style.display = 'none'
            rmClass(el, 'active')
        } else {
            tmpEl = el
            addClass(el, 'active')
            let sourceVal = sourceEl.getAttribute('value')
            let targetVal = targetEl.getAttribute('value')
            let isSource = el === sourceEl
            if (isSource) {
                rmClass(targetEl, 'active')
                rmClass(dropdownEl, 'dropdown_target')
            } else {
                rmClass(sourceEl, 'active')
                addClass(dropdownEl, 'dropdown_target')
            }
            dropdownEl.style.display = 'block'
            dropdownU.forEach(e => {
                rmClass(e, 'active')
                rmClass(e, 'disabled')
                let val = e.getAttribute('value')
                if (isSource) {
                    if (sourceVal === val) {
                        addClass(e, 'active')
                    } else if (targetVal === val) {
                        addClass(e, 'disabled')
                    }
                } else {
                    if (targetVal === val) {
                        addClass(e, 'active')
                    } else if (sourceVal === val) {
                        addClass(e, 'disabled')
                    }
                }
            })
        }
    }
    sourceEl.addEventListener('click', onButton)
    targetEl.addEventListener('click', onButton)
    exchangeEl.addEventListener('click', function () {
        let sourceVal = sourceEl.getAttribute('value')
        let sourceText = sourceEl.innerText
        let targetVal = targetEl.getAttribute('value')
        let targetText = targetEl.innerText
        if (sourceVal === 'auto') return
        sourceEl.setAttribute('value', targetVal)
        sourceEl.innerText = targetText
        targetEl.setAttribute('value', sourceVal)
        targetEl.innerText = sourceText
        setDialogConf('source', targetVal)
        setDialogConf('target', sourceVal)
        rmClass(sourceEl, 'active')
        rmClass(targetEl, 'active')
        dropdownEl.style.display = 'none'
    })
    translateEl.addEventListener('click', function () {
        rmClass(sourceEl, 'active')
        rmClass(targetEl, 'active')
        dropdownEl.style.display = 'none'
        let text = inputEl.innerText.trim()
        sendQuery(text) // 翻译按钮查询
    })
    cropEl.addEventListener('click', function () {
        sendBgMessage({action: 'onCropImg'}).then(_ => {
            location.href.indexOf(root + 'html/popup.html') === 0 && window.close()
        })
    })
    dropdownU.forEach(e => {
        e.addEventListener('click', function () {
            let v = this.getAttribute('value')
            let s = this.innerText
            let isSource = !hasClass(dropdownEl, 'dropdown_target')
            let el = isSource ? sourceEl : targetEl
            rmClass(el, 'active')
            el.setAttribute('value', v)
            el.innerText = s
            dropdownEl.style.display = 'none'
            contentEl.scrollTop = 0
            if (isSource) {
                (v === 'auto' ? addClass : rmClass)(exchangeEl, 'disabled')
                setDialogConf('source', v)
            } else {
                setDialogConf('target', v)
            }
        })
    })

    // 粘贴事件
    inputEl.addEventListener('paste', function (e) {
        e.stopPropagation()
        e.preventDefault()
        let d = e.clipboardData || window.clipboardData
        if (d && d.items.length > 0) {
            let f = d.items[0].getAsFile()
            if (f && f.type.indexOf('image') === 0) {
                // 如果粘贴内容是图片，进行图片文字识别
                let fr = new FileReader()
                fr.readAsDataURL(f)
                fr.onload = function (e) {
                    let base64 = e.target.result
                    sendBgMessage({action: 'img2text', base64})
                }
            } else {
                // 如果是文本，则清理一下
                this.innerText = d.getData('Text')
            }
        }
    })
    inputEl.addEventListener('blur', function () {
        textTmp = this.innerText
    })
    inputEl.addEventListener('keyup', function () {
        if (isPopup && setting.autoConfirm) _setTimeout('translate', () => translateEl.click(), 2000) // 定时自动开始翻译
    })
    isPopup && focusLast(inputEl) // 光标移到结尾

    // 隐藏原文框，减少占用空间
    if (setting.hideOriginal) {
        if (!isPopup && !isFullscreen) { // 排除弹窗
            // translateEl.style.display = 'none'
            inputEl.style.display = 'none'
            E('.dmx_main_trans').style.paddingTop = '0'
        }
    }

    // 隐藏截图框(在独立窗口的时候)
    if (isFullscreen) cropEl.style.display = 'none'

    // 初始值
    let source = dialogConf.source
    let target = dialogConf.target
    if (source === 'auto') addClass(exchangeEl, 'disabled')
    sourceEl.setAttribute('value', source)
    sourceEl.innerText = l[source].zhName
    targetEl.setAttribute('value', target)
    targetEl.innerText = l[target].zhName
}

function initDictionary() {
    dialog.contentHTML(`<div id="dmx_head">
    <div class="case search_box">
        <input id="dictionary_input" type="text" maxlength="100" autocomplete="off">
        <div id="search_remove"><i class="dmx-icon dmx-icon-error"></i></div>
        <div id="search_but"><i class="dmx-icon dmx-icon-search"></i></div>
    </div>
</div>
<div id="case_list" class="dmx_main dmx_content fx"></div>`)

    let inpEl = I('dictionary_input')
    let rmEl = I('search_remove')
    let butEl = I('search_but')
    rmEl.onclick = function () {
        inpEl.value = ''
        inpEl.focus()
    }
    butEl.onclick = function () {
        let text = inpEl.value.trim()
        sendQuery(text) // 词典按钮查询
    }
    inpEl.addEventListener('change', function () {
        textTmp = this.value
    })
    inpEl.addEventListener('keyup', function (e) {
        e.key === 'Enter' && butEl.click()
        if (isPopup) _setTimeout('dictionary', () => butEl.click(), 1000) // 定时自动开始查词
    })
    setTimeout(() => inpEl.focus(), 100)
}

function initSearch() {
    dialog.contentHTML(`<div id="dmx_head">
    <div class="case search_box">
        <input id="search_input" type="text" maxlength="100" autocomplete="off">
        <div id="search_remove"><i class="dmx-icon dmx-icon-error"></i></div>
        <div id="search_but"><i class="dmx-icon dmx-icon-search"></i></div>
    </div>
</div>
<div id="case_list" class="dmx_main dmx_content dmx_main_search fx"></div>`)

    let inpEl = I('search_input')
    let rmEl = I('search_remove')
    let butEl = I('search_but')
    rmEl.onclick = function () {
        inpEl.value = ''
        inpEl.focus()
    }
    butEl.onclick = function () {
        let el = I('case_list').querySelector('[data-search]')
        if (el) el.click()
    }
    inpEl.addEventListener('change', function () {
        textTmp = this.value
    })
    inpEl.addEventListener('keyup', function (e) {
        e.key === 'Enter' && butEl.click()
    })
    setTimeout(() => inpEl.focus(), 100)

    // 创建按钮
    let s = ''
    let sList = setting.searchList
    let cList = getSearchList(searchText)
    for (let name of sList) {
        if (cList[name]) s += `<div class="dmx_button" data-search="${name}">${name}</div>`
    }
    I('case_list').innerHTML = s

    // 绑定点击事件
    onD(A('[data-search]'), 'click', function () {
        let name = this.dataset.search
        let url = cList[name]
        if (!url) return
        let text = I('search_input').value.trim()
        if (text) {
            open(url.format(decodeURIComponent(text)))
        } else {
            open((new URL(url)).origin)
        }
    })
}

function initSetting() {
    dialog.contentHTML(`<iframe id="dmx_iframe" src="${root + 'html/setting.html'}" importance="high"></iframe>`)
}

function initMore() {
    dialog.contentHTML(`<iframe id="dmx_iframe" src="${root + 'html/more.html?isSome=' + isSome}" importance="high"></iframe>`)
}

function initDictionaryCSS() {
    let styleEl = E('style')
    conf.dictionaryCSS.forEach(name => {
        if (!setting.dictionaryList.includes(name) || !dictionaryCSS[name] || E(`style[data-name="${name}"]`)) return
        let s = `<style data-name="${name}">${dictionaryCSS[name]}</style>`
        styleEl.insertAdjacentHTML('afterend', s)
    })
}

function initCrop() {
    let startX = 0, startY = 0
    let bgEl = I('dmx_crop_bg')
    let fgEl = I('dmx_crop_fg')
    bgEl.style.display = 'block'
    let funDown = (e) => {
        startX = e.clientX
        startY = e.clientY
        fgEl.style.display = 'block'
        fgEl.style.left = startX + 'px'
        fgEl.style.top = startY + 'px'
        document.addEventListener('mousemove', funMove)
        document.addEventListener('mouseup', funUp)
    }
    let funMove = (e) => {
        let w = e.clientX - startX
        let h = e.clientY - startY
        if (w > 0) {
            fgEl.style.width = w + 'px'
        } else {
            fgEl.style.left = e.clientX + 'px'
            fgEl.style.width = -w + 'px'
        }
        if (h > 0) {
            fgEl.style.height = h + 'px'
        } else {
            fgEl.style.top = e.clientY + 'px'
            fgEl.style.height = -h + 'px'
        }
    }
    let funUp = (e) => {
        bgEl.removeAttribute('style')
        fgEl.removeAttribute('style')
        bgEl.removeEventListener('mousedown', funDown)
        document.removeEventListener('mousemove', funMove)
        document.removeEventListener('mouseup', funUp)
        let width = e.clientX - startX
        let height = e.clientY - startY
        if (width < 0) {
            width = -width
            startX = e.clientX
        }
        if (height < 0) {
            height = -height
            startY = e.clientY
        }
        let innerHeight = window.innerHeight || document.documentElement.offsetHeight
        if (width > 15 && height > 15) {
            sendBgMessage({action: 'onCapture', startX, startY, width, height, innerHeight})
            dmxAlert('截图文字识别中...', 'success')
        } else {
            dmxAlert('截图太小，取消识别', 'error')
        }
    }
    bgEl.addEventListener('mousedown', funDown)
}

function loadingTranslate() {
    let el = I('case_list')
    let cList = conf.translateList
    let sList = setting.translateList
    if (sList.length < 1) {
        el.innerHTML = `<div class="case case_content"><i class="dmx-icon dmx-icon-info"></i> 您未启用任何翻译模块</div>`
        return
    }

    let s = ''
    sList.forEach(name => {
        s += `<div class="case" id="${name}_translate_case">
    <div class="case_top fx">
        <div class="case_left case_language"></div>
        <div class="case_right">
            <a class="case_link"><i class="dmx-icon dmx-icon-${name}"></i>${cList[name]}</a>
        </div>
        <div class="case_right case_copy" title="复制"><i class="dmx-icon dmx-icon-copy"></i></div>
        <div class="case_right case_bilingual dmx-icon">双语</div>
    </div>
    <div class="case_content"><div class="dmx_loading"></div></div>
</div>`
    })
    el.innerHTML = s

    // 绑定事件
    sList.forEach(name => {
        let caseEl = I(`${name}_translate_case`)
        let copyEl = caseEl.querySelector('.case_copy')
        let bilingualEl = caseEl.querySelector('.case_bilingual')
        let contentEl = caseEl.querySelector('.case_content')
        copyEl.addEventListener('click', () => {
            let text = contentEl.innerText.replace(/\n{2}/g, '\n').trim()
            execCopy(text)
            dmxAlert('复制成功', 'success')
        })
        bilingualEl.addEventListener('click', () => {
            if (hasClass(bilingualEl, 'active')) {
                resultTranslate(name, false)
                rmClass(bilingualEl, 'active')
            } else {
                resultTranslate(name, true)
                addClass(bilingualEl, 'active')
            }
        })
    })
}

function loadingDictionary() {
    let el = I('case_list')
    let cList = conf.dictionaryList
    let sList = setting.dictionaryList
    if (sList.length < 1) {
        el.innerHTML = `<div class="case case_content"><i class="dmx-icon dmx-icon-info"></i> 您未启用任何词典模块</div>`
        return
    }

    let s = ''
    sList.forEach(name => {
        s += `<div class="case" id="${name}_dictionary_case">
        <div class="case_top fx">
            <div class="case_right">
                <a class="case_link"><i class="dmx-icon dmx-icon-${name}"></i>${cList[name]}</a>
            </div>
            <div class="case_left case_pronunciation"></div>
        </div>
        <div class="case_content"><div class="dmx_loading"></div></div>
    </div>`
    })
    el.innerHTML = s
}

function resultTranslate(name, isBilingual) {
    let el = I(`${name}_translate_case`)
    if (!el) return
    let {srcLan, tarLan, lanTTS, data, extra} = msgList[name] || {}

    // 显示发音图标
    if (srcLan && tarLan) {
        let sourceStr = soundIconHTML(srcLan, lanTTS, 'source')
        let targetStr = soundIconHTML(tarLan, lanTTS, 'target')
        el.querySelector('.case_language').innerHTML = `${sourceStr} » ${targetStr}`

        let sourceEl = el.querySelector('[data-type=source]')
        let targetEl = el.querySelector('[data-type=target]')
        sourceEl && sourceEl.addEventListener('click', function () {
            activeRipple(this)
            sendPlayTTS(name, 'source', srcLan, dQuery.text) // 播放原音
        })
        targetEl && targetEl.addEventListener('click', function () {
            activeRipple(this)
            let s = ''
            data && data.forEach(v => {
                s += v.tarText + '\n'
            })
            s && sendPlayTTS(name, 'target', tarLan, s) // 播放译音
        })
    }

    // 显示翻译结果
    let s = ''
    data && data.forEach(v => {
        if (isBilingual) {
            s += `<p class="source_text">${v.srcText}</p><p>${v.tarText}</p>`
        } else {
            s += `<p>${v.tarText}</p>`
        }
    })
    if (extra) s += extra // 重点词汇 && 单词含义
    if (!s) s = '网络错误，请稍后再试'
    el.querySelector('.case_content').innerHTML = s

    // 绑定点击搜索
    resultBindEvent(el, 'translate', name)
}

function resultDictionary(m) {
    let {name, result, error} = m
    let el = I(`${name}_dictionary_case`)
    if (!el) return
    let cEl = el.querySelector('.case_content')
    if (error) {
        cEl.innerHTML = '网络错误，请稍后再试'
        return
    }

    let {html, phonetic, sound} = result || {}

    // 音标
    let pron = ''
    if (phonetic) {
        let {uk, us} = phonetic
        if (uk && us) {
            pron += `[${uk} $ ${us}]`
        } else if (uk) {
            pron += `[${uk}]`
        } else if (us) {
            pron += `[$ ${us}]`
        }
    }

    // 发音
    sound && sound.forEach(v => {
        let {isWoman, type, url, title} = v
        let className = isWoman ? 'dmx_pink' : ''
        if (!title) title = type === 'uk' ? '英音' : type === 'us' ? '美音' : ''
        pron += ` <i class="dmx-icon dmx_ripple ${className}" data-type="${type}" data-src-mp3="${url}" title="${title}"></i>`
    })

    if (!html) html = 'Sorry! 没有查询到结果。'
    el.querySelector('.case_content').innerHTML = html
    el.querySelector('.case_pronunciation').innerHTML = pron

    resultBindEvent(el, 'dictionary', m.name)
}

function resultBindEvent(el, nav, name) {
    // 绑定播放音频
    el.querySelectorAll('[data-src-mp3]').forEach(e => {
        let obj = {uk: '&#xe69f;', us: '&#xe674;', en: '&#xe6a8;', other: '&#xe67a;'}
        let type = e.getAttribute('data-type')
        if (!obj[type]) {
            type = 'other'
            e.setAttribute('data-type', type)
        }
        e.innerHTML = obj[type] // 喇叭字体
        e.addEventListener('click', function () {
            activeRipple(this)
            let type = this.getAttribute('data-type')
            let url = this.getAttribute('data-src-mp3')
            sendPlaySound(nav, name, type, url)
        })
    })

    // 绑定点击搜索
    el.querySelectorAll('[data-search=true]').forEach(e => {
        e.addEventListener('click', function () {
            let text = this.innerText && this.innerText.trim()
            sendQuery(text) // 结果点击查询
        })
    })
}

function resultLink(m) {
    let el = I(`${m.name}_${m.type}_case`)
    if (!el) return
    let sEl = el.querySelector(`.case_link`)
    if (sEl) {
        sEl.setAttribute('href', m.link)
        sEl.setAttribute('target', '_blank')
        sEl.setAttribute('referrerPolicy', 'no-referrer')
    }
}

function resultSound(m) {
    let {nav, name, type, status, error} = m
    // if (error) dmxAlert(error, 'error') // 播放声音出错提示
    let el = I(`${name}_${nav}_case`)
    if (!el) return
    if (status === 'start') {
        let sEl = el.querySelector(`[data-type=${type}]`)
        if (sEl) addClass(sEl, 'active')
    } else {
        let dEl = el.querySelectorAll(`[data-type=${type}]`)
        if (dEl) rmClassD(dEl, 'active')
    }
    addClass(I('dmx_voice'), 'dmx_show')
}

function activeRipple(el) {
    rmClassD(A('.dmx_ripple'), 'active')
    addClass(el, 'active')
}

function soundIconHTML(lan, lanArr, type) {
    let title = languageList[lan] ? languageList[lan].zhName : ''
    let arr = {
        'zh': '&#xe675;',
        'en': '&#xe6a8;',
        'jp': '&#xe6a0;',
        'th': '&#xe69c;',
        'spa': '&#xe6a5;',
        'ara': '&#xe6a7;',
        'fra': '&#xe676;',
        'kor': '&#xe6a6;',
        'ru': '&#xe69d;',
        'de': '&#xe677;',
        'pt': '&#xe69e;',
        'it': '&#xe6a4;',
        'el': '&#xe6a1;',
        'nl': '&#xe6a3;',
        'pl': '&#xe6a9;'
    }
    let iconStr = arr[lan] || '&#xe67a;'
    let s = title
    if (!lanArr || inArray(lan, lanArr)) {
        s += ` <i class="dmx-icon dmx_ripple" data-type="${type}" title="${title}发音">${iconStr}</i>`
    }
    return s
}

// 发送到后台缓存起来
function sendBgCache(text) {
    if (window.textRepeat !== text) {
        window.textRepeat = text
        sendBgMessage({action: 'textTmp', text})
    }
}

// 自动切换翻译或词典
function autoChangeAction(text) {
    if (!setting.autoChange) return
    let arr = text.match(/\s+/g)
    let isWord = !arr || arr.length < 3 // 是否为单词活词组

    A('#dmx_navigate > u').forEach(el => rmClass(el, 'active')) // 去掉选中
    let onEl = E(`#dmx_navigate > u[action="${isWord ? 'dictionary' : 'translate'}"]`)
    if (onEl) {
        // 选中翻译或词典
        addClass(onEl, 'active')
        onEl.click()
    }
}

function initQuery(text, clientX, clientY) {
    // Unicode property escapes 正则表达式:
    // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide/Regular_Expressions/Unicode_Property_Escapes
    // https://www.unicode.org/Public/UCD/latest/ucd/PropertyValueAliases.txt
    // https://tc39.es/ecma262/#table-nonbinary-unicode-properties
    // https://keqingrong.github.io/blog/2020-01-29-regexp-unicode-property-escapes
    if (setting.excludeChinese && /\p{Script=Han}/u.test(text)) return // 排除中文
    if (setting.excludeSymbol && /^[\p{S}\p{P}^$.*+\-?=!:|\\/！？。；－＿～﹏，：、·;…,"“”﹃﹄「」﹁﹂『』﹃﹄（）［］〔〕【】《》〈〉()\[\]{}<>\s]+$/u.test(text)) return // 排除纯符号
    if (setting.excludeNumber && /^\d+$/u.test(text)) return // 排除纯数字

    sendBgCache(text)
    if (!text) {
        iconBut.style.display = 'none'
        return
    }

    debug('text:', text)

    // 自动复制功能
    if (setting.autoCopy === 'on') {
        sendBgMessage({action: 'copy', text})
        dmxAlert('复制成功', 'success')
    }

    if (setting.scribble === 'off') return
    if (setting.scribble === 'direct') {
        autoChangeAction(text) // 自动切换翻译或词典
        sendQuery(text) // 划词查询
        showDialog(clientX + 30, clientY - 60)
    } else if (setting.scribble === 'clickIcon') {
        iconText = text
        let x = clientX + 10
        let y = clientY - 45
        x = x + 42 < document.documentElement.clientWidth ? x : clientX - 42
        y = y > 10 ? y : clientY + 10
        iconBut.style.transform = `translate(${x}px, ${y}px)`
        iconBut.style.display = 'flex'
    }
}

function sendQuery(text) {
    if (!text) {
        if (isClipboardRead) text = execPaste() // 自动读取粘贴板内容
        if (!text && isPopup && setting.autoPaste === 'on') text = execPaste()
        if (!text) text = textTmp
        if (!text) return
    }
    let el = I('dmx_navigate')
    let action = el.querySelector('.active') && el.querySelector('.active').getAttribute('action')
    if (!action) {
        action = dialogConf.action
        let actionEl = el.querySelector(`u[action="${action}"]`)
        if (actionEl) actionEl.click()
    }
    if (!checkChange(action, text)) return

    let message = null
    if (setting.cutHumpName === 'on' && action !== 'search') text = cutHumpName(text)
    if (action === 'translate') {
        let inputEl = I(`translate_input`)
        inputEl.innerText = text
        isPopup && focusLast(inputEl)
        loadingTranslate()
        message = {action: action, text: text, srcLan: dialogConf.source, tarLan: dialogConf.target}
    } else if (action === 'dictionary') {
        I(`dictionary_input`).value = text
        loadingDictionary()
        message = {action: action, text: text}
    } else if (action === 'search') {
        I(`search_input`).value = text
    }
    showSearchSide(text)
    if (message) {
        message = Object.assign({formTitle: document.title, formUrl: location.href}, message)
        sendBgMessage(message)
    }
}

// 切分驼峰词组
function cutHumpName(s) {
    let isCapital = function (s) {
        let c = s.charAt(0)
        return c >= 'A' && c <= 'Z'
    }
    return s.replace(/\w+[A-Z]\w?/g, (...args) => {
        let str = args[0]
        let newStr = ''
        for (let i = 0; i < str.length; i++) {
            let l = str[i]
            if (l === '_') l = ' '
            else if (isCapital(l) && (i - 1 > 0 && str[i - 1] !== '_' && !isCapital(str[i - 1]))) newStr += ' '
            newStr += l
        }
        return newStr
    })
}

function mouseWords(e) {
    let x = e.clientX
    let y = e.clientY
    if (!x || !y) return

    let textNode, offset, arr
    if (document.caretPositionFromPoint) {
        let p = document.caretPositionFromPoint(x, y)
        if (!p) return
        textNode = p.offsetNode
        offset = p.offset
    } else if (document.caretRangeFromPoint) {
        let p = document.caretRangeFromPoint(x, y)
        if (!p) return
        textNode = p.startContainer
        offset = p.startOffset
    }
    if (!textNode || textNode.nodeType !== 3) return

    let str = textNode.data
    let before = (arr = str.slice(0, offset).match(/[a-z’']+$/i)) ? arr[0] : ''
    let after = (arr = str.slice(offset).match(/^[a-z’']+/i)) ? arr[0] : ''
    if (before.length === 0 && after.length === 0) return

    let range = document.createRange()
    range.setStart(textNode, offset - before.length)
    range.setEnd(textNode, offset + after.length)
    let bcr = range.getBoundingClientRect()
    if (x >= bcr.left && x <= bcr.right && y >= bcr.top && y <= bcr.bottom) {
        let se = window.getSelection()
        se.removeAllRanges()
        se.addRange(range)

        let text = before + after
        if (text && window.textRepeat !== text) {
            sendBgCache(text)
            sendQuery(text) // 鼠标停留获取单词
            showDialog()
        }
    }
    range.detach()
}

function showSearchSide(text) {
    let arr = setting.searchSide
    let s = ''
    if (text && isArray(arr) && arr.length > 0) {
        let sList = getSearchList(searchText)
        for (let name of arr) {
            let url = sList[name]
            if (url) s += `<a href="${url.format(decodeURIComponent(text))}" title="${name}" target="_blank">${name[0]}</a>`
        }
    }
    I('dmx_dialog_left').innerHTML = s
}

function showDialog(left, top) {
    let options = null
    let position = setting.position
    if (isPopup) {
        // 跳过
    } else if (position === 'follow') {
        options = {left, top}
    } else if (position === 'right') {
        dialog.el.removeAttribute('style')
        dialog.el.style.width = dialogConf.width + 'px'
        dialog.el.className = 'dmx_keep_right'
    }
    dialog.show(options)
}

function checkChange(action, text) {
    let d = dQuery
    let source = dialogConf.source
    let target = dialogConf.target
    if (d.action === action && d.text === text && d.source === source && d.target === target) return false
    dQuery = {action, text, source, target}
    addHistory(dQuery)
    return true
}

function addHistory(dQuery) {
    if (disHistory) return disHistory = false
    if (!['translate', 'dictionary', 'search'].includes(dQuery.action)) return
    if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1, history.length)
    } else if (history.length >= 1000) {
        history.shift() // 最多只保留 1000 条
    }
    history.push(dQuery)
    historyIndex = history.length - 1
    debug('history:', history, historyIndex)
    if (history.length > 1) {
        let hEl = I('dmx_history')
        rmClass(hEl.querySelector('.dmx-icon-left'), 'disabled')
        addClass(hEl.querySelector('.dmx-icon-right'), 'disabled')
    }
}

function focusLast(el) {
    setTimeout(() => {
        el.focus()
        let range = window.getSelection()
        range.selectAllChildren(el)
        range.collapseToEnd() // 光标移到结尾
    }, 200)
}

function I(id) {
    return shadow.getElementById(id)
}

function E(s) {
    return shadow.querySelector(s)
}

function A(s) {
    return shadow.querySelectorAll(s)
}

function saveDialogConf() {
    storageSyncSet({'dialogConf': dialogConf})
}

function setDialogConf(name, value) {
    dialogConf[name] = value
    saveDialogConf()
}

function allowUserSelect() {
    dmxAlert('解除页面限制完成', 'success')
    let styleEl = document.getElementById('_dream_style_all')
    if (!styleEl) {
        let sEl = document.createElement('style')
        sEl.id = '_dream_style_all'
        sEl.textContent = `* {-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important;pointer-events:auto!important;}`
        document.head.appendChild(sEl)
    }

    let onAllow = function (el, event) {
        if (el.getAttribute && el.getAttribute(event)) el.setAttribute(event, () => true)
    }
    onAllow(document, 'oncontextmenu')
    onAllow(document, 'onselectstart')

    // 清除再添加，排除重复事件
    let onClean = function (e) {
        e.stopPropagation()
        let el = e.target
        while (el) {
            onAllow(el, 'on' + e.type)
            el = el.parentNode
        }
    }
    document.removeEventListener('contextmenu', onClean, true)
    document.removeEventListener('selectstart', onClean, true)
    document.addEventListener('contextmenu', onClean, true)
    document.addEventListener('selectstart', onClean, true)
}

function sendPlayTTS(name, type, lang, text) {
    sendBgMessage({action: 'translateTTS', name, type, lang, text})
}

function sendPlaySound(nav, name, type, url) {
    sendBgMessage({action: 'playSound', nav, name, type, url})
}

function sendBgMessage(message) {
    return new Promise((resolve, reject) => {
        sendMessage(message).then(_ => {
            resolve()
        }).catch(err => {
            // 减少错误提示框
            if (getTimestamp() > (window.dmxUpdateDate || 0)) {
                window.dmxUpdateDate = getTimestamp() + 5
                dmxAlert('梦想翻译已升级，请刷新页面激活。', 'error')
            }
            debug('sendBgMessage error:', err)
            // reject(err)
            resolve()
        })
    })
}

function dmxAlert(message, type, timeout) {
    type = type || 'info'
    timeout = timeout || 2500
    let el = I('dmx_alert')
    if (!el) {
        el = document.createElement('div')
        el.id = 'dmx_alert'
        shadow.appendChild(el)
    }
    let icon = {
        info: '<i class="dmx-icon dmx-icon-info"></i>',
        error: '<i class="dmx-icon dmx-icon-close"></i>',
        success: '<i class="dmx-icon dmx-icon-success"></i>',
    }
    let m = document.createElement('div')
    m.className = `dxm_alert_${type}`
    m.innerHTML = (icon[type] || '') + message
    el.appendChild(m)
    setTimeout(() => {
        addClass(m, 'an_top')
    }, 10)
    setTimeout(() => {
        addClass(m, 'an_delete')
        setTimeout(() => {
            el.removeChild(m)
        }, 300)
    }, timeout)
}

function dmxDialog(options) {
    if (window._MxDialog) return window._MxDialog
    let o = Object.assign({
        width: 500,
        height: 300,
        minWidth: 200,
        minHeight: 200,
        show: false,
        autoHide: true,
        isMove: true,
        isResize: true,
        onResize: null,
        cssText: '',
        contentHTML: '',
    }, options || {})

    let d = document.createElement('div')
    d.setAttribute('mx-name', 'dream-translation')
    document.documentElement.appendChild(d)
    shadow = d.attachShadow({mode: 'closed'})
    shadow.innerHTML = `<link rel="stylesheet" href="${root + 'css/content.css'}">
<style>${o.cssText}</style>
<div id="dmx_dialog">
    <div id="dmx_dialog_title">
        <div class="dmx_left">
            <div id="dmx_close"><i class="dmx-icon dmx-icon-close"></i></div>
            <div id="dmx_pin" class="dmx-icon"></div>
            <div id="dmx_fullscreen" class="dmx-icon"></div>
            <div id="dmx_history">
                <i class="dmx-icon disabled dmx-icon-left"></i>
                <i class="dmx-icon disabled dmx-icon-right"></i>
            </div>
            <div id="dmx_navigate">
                <u class="dmx-icon" action="translate">翻译</u>
                <u class="dmx-icon" action="dictionary">词典</u>
                <u class="dmx-icon" action="search">搜索</u>
            </div>
        </div>
        <div class="dmx_right">
            <div id="dmx_setting"><i class="dmx-icon dmx-icon-setting"></i></div>
            <div id="dmx_more"><i class="dmx-icon dmx-icon-more"></i></div>
            <div id="dmx_voice" class="dmx_hide"><i class="dmx-icon dmx-icon-voice"></i></div>
            <div id="dmx_heart" class="dmx_hide"><i class="dmx-icon dmx-icon-heart"></i></div>
        </div>
    </div>
    <div id="dmx_dialog_content">${o.contentHTML}</div>
    <div id="dmx_dialog_resize_n"></div>
    <div id="dmx_dialog_resize_e"></div>
    <div id="dmx_dialog_resize_s"></div>
    <div id="dmx_dialog_resize_w"></div>
    <div id="dmx_dialog_resize_nw"></div>
    <div id="dmx_dialog_resize_ne"></div>
    <div id="dmx_dialog_resize_sw"></div>
    <div id="dmx_dialog_resize_se"></div>
    <div id="dmx_dialog_left"></div>
</div>
<div id="dmx_mouse_icon"></div>
<div id="dmx_crop_bg"></div>
<div id="dmx_crop_fg"></div>`

    let el = I('dmx_dialog')
    let clientX, clientY, elX, elY, elW, elH, docW, docH, mid
    let _m = function (e) {
        let left = e.clientX - (clientX - elX)
        let top = e.clientY - (clientY - elY)
        let maxLeft = docW - elW
        let maxTop = docH - elH
        left = Math.max(0, Math.min(left, maxLeft))
        top = Math.max(0, Math.min(top, maxTop))
        el.style.left = left + 'px'
        el.style.top = top + 'px'
    }
    let _n = function (e) {
        let top = e.clientY - (clientY - elY)
        let height = elY - top + elH
        if (height > o.minHeight && top >= 0) {
            el.style.top = top + 'px'
            el.style.height = height + 'px'
            typeof o.onResize === 'function' && o.onResize({height: height})
        }
    }
    let _e = function (e) {
        let left = e.clientX - (clientX - elX)
        let width = left - elX + elW
        if (width > o.minWidth && e.clientX < docW - (elW - (clientX - elX))) {
            el.style.width = width + 'px'
            typeof o.onResize === 'function' && o.onResize({width: width})
        }
    }
    let _s = function (e) {
        let top = e.clientY - (clientY - elY)
        let height = top - elY + elH
        if (e.clientY < docH - (elH - (clientY - elY)) && height > o.minHeight) {
            el.style.height = height + 'px'
            typeof o.onResize === 'function' && o.onResize({height: height})
        }
    }
    let _w = function (e) {
        let left = e.clientX - (clientX - elX)
        let width = elW - (left - elX)
        if (left >= 0 && width > o.minWidth) {
            el.style.left = left + 'px'
            el.style.width = width + 'px'
            typeof o.onResize === 'function' && o.onResize({width: width})
        }
    }
    let onMousedown = function (e) {
        e.stopPropagation()
        mid = this.id
        clientX = e.clientX
        clientY = e.clientY
        let b = el.getBoundingClientRect()
        elX = b.left || el.offsetLeft
        elY = b.top || el.offsetTop
        elW = b.width || el.offsetWidth
        elH = b.height || el.offsetHeight
        docW = document.documentElement.clientWidth
        docH = document.documentElement.clientHeight
        addClass(document.body, 'dmx_unselectable')
        addClass(el, 'dmx_unselectable')
    }
    let onMouseup = function (e) {
        // e.stopPropagation() // 和B站播放进度条冲突
        mid = null
        rmClass(document.body, 'dmx_unselectable')
        rmClass(el, 'dmx_unselectable')
    }
    let onMousemove = function (e) {
        if (mid === 'dmx_dialog_title') {
            _m(e)
        } else if (mid === 'dmx_dialog_resize_n') {
            _n(e)
        } else if (mid === 'dmx_dialog_resize_e') {
            _e(e)
        } else if (mid === 'dmx_dialog_resize_s') {
            _s(e)
        } else if (mid === 'dmx_dialog_resize_w') {
            _w(e)
        } else if (mid === 'dmx_dialog_resize_nw') {
            _n(e)
            _w(e)
        } else if (mid === 'dmx_dialog_resize_ne') {
            _n(e)
            _e(e)
        } else if (mid === 'dmx_dialog_resize_sw') {
            _s(e)
            _w(e)
        } else if (mid === 'dmx_dialog_resize_se') {
            _s(e)
            _e(e)
        }
    }
    document.addEventListener('mousemove', onMousemove)
    document.addEventListener('mouseup', onMouseup)
    document.addEventListener('mouseleave', onMouseup) // 鼠标离开浏览器
    el.addEventListener('mouseup', function (e) {
        e.stopPropagation() // 解决点击面板闪耀问题
        onMouseup()
    })

    let elArr = ['n', 'e', 's', 'w', 'nw', 'ne', 'sw', 'se']
    let fsTmp = {} // 全屏设置临时缓存
    let D = {}
    D.el = el
    D.shadow = shadow
    D.destroy = function () {
        document.removeEventListener('mousemove', onMousemove)
        document.removeEventListener('mouseup', onMouseup)
        document.removeEventListener('mouseup', D.hide)
        el.remove()
    }
    D.show = function (o) {
        setTimeout(() => {
            el.style.display = 'block'
            if (!o || typeof o.left !== 'number' || typeof o.top !== 'number') return
            let d = document.documentElement
            let b = el.getBoundingClientRect()
            el.style.left = Math.max(0, Math.min(o.left, d.clientWidth - b.width)) + 'px'
            el.style.top = Math.max(0, Math.min(o.top, d.clientHeight - b.height)) + 'px'
        }, 80)
    }
    D.hide = function () {
        el.style.display = 'none'
    }
    D.enableMove = function () {
        let e = I('dmx_dialog_title')
        e.style.cursor = 'move'
        e.addEventListener('mousedown', onMousedown)
    }
    D.disableMove = function () {
        let e = I('dmx_dialog_title')
        e.style.cursor = 'auto'
        e.removeEventListener('mousedown', onMousedown)
    }
    D.enableResize = function () {
        elArr.forEach(v => {
            let e = I(`dmx_dialog_resize_${v}`)
            e.removeAttribute('style')
            e.addEventListener('mousedown', onMousedown)
        })
    }
    D.disableResize = function () {
        elArr.forEach(v => {
            let e = I(`dmx_dialog_resize_${v}`)
            e.style.display = 'none'
            e.removeEventListener('mousedown', onMousedown)
        })
    }
    D.fullScreen = function () {
        addClass(I('dmx_fullscreen'), 'active')
        addClass(document.body, 'dmx_overflow_hidden')
        fsTmp = {top: el.style.top, left: el.style.left, width: el.style.width, height: el.style.height}
        el.style.top = '0'
        el.style.left = '0'
        el.style.width = document.documentElement.clientWidth + 'px'
        el.style.height = document.documentElement.clientHeight + 'px'
    }
    D.fullScreenExit = function () {
        rmClass(I('dmx_fullscreen'), 'active')
        rmClass(document.body, 'dmx_overflow_hidden')
        if (typeof fsTmp.top === 'string') el.style.top = fsTmp.top
        if (typeof fsTmp.left === 'string') el.style.left = fsTmp.left
        if (typeof fsTmp.width === 'string') el.style.width = fsTmp.width
        if (typeof fsTmp.height === 'string') el.style.height = fsTmp.height
    }
    D.pin = function () {
        addClass(I('dmx_pin'), 'active')
        document.removeEventListener('mouseup', D.hide)
    }
    D.pinCancel = function () {
        rmClass(I('dmx_pin'), 'active')
        document.addEventListener('mouseup', D.hide) // 点击 body 隐藏 dialog
    }
    D.contentHTML = function (s) {
        I('dmx_dialog_content').innerHTML = s
    }
    window._MxDialog = D

    // 初始设置
    if (o.width !== 'auto') el.style.width = Number(o.width) + 'px'
    if (o.height !== 'auto') el.style.height = Number(o.height) + 'px'
    o.show ? D.show() : D.hide()
    o.autoHide ? D.pinCancel() : D.pin()
    o.isMove ? D.enableMove() : D.disableMove()
    o.isResize ? D.enableResize() : D.disableResize()

    // 顶部按钮事件
    I('dmx_close').onclick = function () {
        D.hide()
        rmClass(document.body, 'dmx_overflow_hidden')
    }
    I('dmx_pin').onclick = function () {
        hasClass(this, 'active') ? D.pinCancel() : D.pin()
    }
    I('dmx_fullscreen').onclick = function () {
        hasClass(this, 'active') ? D.fullScreenExit() : D.fullScreen()
    }

    // 阻止冒泡
    shadow.querySelectorAll('.dmx-icon').forEach(v => {
        v.addEventListener('mousedown', e => e.stopPropagation())
    })

    return D
}
