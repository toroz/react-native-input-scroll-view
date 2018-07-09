/**
 * @providesModule InputScrollView
 * @author Junjie.Bai
 * @license MIT
 */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import {
    StyleSheet,
    View,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    Animated,
    UIManager,
} from 'react-native';

const isIOS = Platform.OS === 'ios';

let debounce;

if (isIOS) {
    debounce = function(func, wait) {
        wait = wait || 0;
        let id, count;
        let action = function(event) {
            if (count) {
                count--;
                id = requestAnimationFrame(() => action.call(this, event));
            } else {
                func.call(this, event);
            }
        };
        return function({ ...event }) {
            cancelAnimationFrame(id);
            count = wait;
            action.call(this, event);
        };
    };
} else {
    debounce = function(func, wait) {
        wait = wait || 0;
        let id, count;
        let action = function(event) {
            if (count) {
                count--;
                id = setTimeout(() => action.call(this, event));
            } else {
                func.call(this, event);
            }
        };
        return function({ ...event }) {
            clearTimeout(id);
            count = wait;
            action.call(this, event);
        };
    };
}

export default class extends Component {
    static propTypes = {
        keyboardOffset: PropTypes.number,
        multilineInputStyle: PropTypes.oneOfType([
            PropTypes.object,
            PropTypes.array,
            PropTypes.number,
        ]),
        useAnimatedScrollView: PropTypes.bool,
        useKeyboardAvoidingView: PropTypes.bool,
    };

    static defaultProps = {
        keyboardOffset: 40,
        multilineInputStyle: null,
        useAnimatedScrollView: false,
        useKeyboardAvoidingView: false,
    };

    state = {
        measureInputVisible: false,
        measureInputValue: '',
        measureInputWidth: 0,
        contentBottomOffset: 0,
    };

    componentWillMount() {
        this._root = null;
        this._measureCallback = null;
        this._keyboardShow = false;
        this._topOffset = 0;
        this._inputInfoMap = {};

        this._addListener();
        this._extendScrollViewFunc();
    }

    componentWillUnmount() {
        this._removeListener();
    }

    render() {
        const {
            multilineInputStyle,
            children,
            useAnimatedScrollView,
            useKeyboardAvoidingView,
            ...otherProps,
        } = this.props;

        const {
            measureInputVisible,
            measureInputValue,
            measureInputWidth,
            contentBottomOffset,
        } = this.state;

        const newChildren = this._cloneDeepComponents(children);

        const ScrollComponent = useAnimatedScrollView ? Animated.ScrollView : ScrollView;
        const ContainerComponent = useKeyboardAvoidingView ? KeyboardAvoidingView : View;

        return (
            <ContainerComponent behavior={isIOS ? 'padding' : null}>
                <View style={styles.wrap}>
                    <ScrollComponent ref={this._onRef}
                                     onMomentumScrollEnd={this._onMomentumScrollEnd}
                                     onFocusCapture={this._onFocus} {...otherProps}>
                        <View style={{ marginBottom: contentBottomOffset }}
                              onStartShouldSetResponderCapture={isIOS ? this._onTouchStart : null}
                              onResponderMove={this._onTouchMove}
                              onResponderRelease={this._onTouchEnd}>
                            {newChildren}
                            <View style={styles.hidden}
                                  pointerEvents="none">
                                {
                                    measureInputVisible &&
                                    <TextInput style={[multilineInputStyle, { width: measureInputWidth }]}
                                               value={measureInputValue}
                                               onContentSizeChange={this._onContentSizeChangeMeasureInput}
                                               editable={false}
                                               multiline />
                                }
                            </View>
                        </View>
                    </ScrollComponent>
                </View>
            </ContainerComponent>
        );
    }

    _addListener() {
        this._keyboardShowListener = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', this._onKeyboardShow);
        this._keyboardHideListener = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', this._onKeyboardHide);
    }

    _removeListener() {
        this._keyboardShowListener && this._keyboardShowListener.remove();
        this._keyboardHideListener && this._keyboardHideListener.remove();
        this._keyboardShowListener = null;
        this._keyboardHideListener = null;
    }

    _extendScrollViewFunc() {
        const funcArray = [
            'scrollTo',
            'scrollToEnd',
        ];

        funcArray.forEach(funcName => {
            this[funcName] = (...args) => {
                this._root[funcName](...args);
            };
        });
    }

    _cloneDeepComponents(Component) {
        if (isArray(Component)) {
            return Component.map(subComponent => this._cloneDeepComponents(subComponent));
        } else if (Component && Component.props && Component.props.children) {
            const newComponent = { ...Component };
            newComponent.props = { ...Component.props };
            newComponent.props.children = this._cloneDeepComponents(Component.props.children);
            return newComponent;
        } else if (Component && Component.props && Component.props.multiline) {
            const newComponent = { ...Component };
            newComponent.props = { ...Component.props };
            return this._addMultilineHandle(newComponent);
        } else {
            return Component;
        }
    }

    _addMultilineHandle(Component) {
        const onSelectionChange = Component.props.onSelectionChange;
        const onContentSizeChange = Component.props.onContentSizeChange;

        Component.props.onSelectionChange = ({ ...event }) => {
            if (isIOS) {
                requestAnimationFrame(() => this._onSelectionChange(event));
            } else {
                setTimeout(() => this._onSelectionChange(event));
            }
            onSelectionChange &&
                onSelectionChange(event);
        };

        Component.props.onContentSizeChange = debounce(({ ...event }) => {
            this._onContentSizeChange(event);
            onContentSizeChange &&
                onContentSizeChange(event);
        }, 2);

        return Component;
    }

    _getInputInfo(target) {
        return this._inputInfoMap[target] = this._inputInfoMap[target] || {};
    }

    _measureCursorPosition(text, width, callback) {
        this._measureCallback = callback;
        this.setState({
            measureInputVisible: true,
            measureInputValue: text,
            measureInputWidth: width,
        });
    }

    _onContentSizeChangeMeasureInput = debounce(({ nativeEvent: event }) => {
        if (!this._measureCallback) return;
        this._measureCallback(event.contentSize.height);
        this._measureCallback = null;
        this.setState({ measureInputVisible: false });
    }, 3);

    _onRef = root => {
        const { useAnimatedScrollView } = this.props;
        if (!root) return;
        this._root = root;

        if (useAnimatedScrollView && this._root._component) {
            this._root = this._root._component;
        }

        setTimeout(() => {
            this._root._innerViewRef &&
            this._root._innerViewRef.measureInWindow((x, y, width, height) => {
                this._topOffset = y;
            });
        });
    };

    _onMomentumScrollEnd = ({ nativeEvent: event }) => {
        if (!this._keyboardShow) return;
        const contentBottomOffset = Math.max(
            0,
            this.state.contentBottomOffset +
            event.layoutMeasurement.height +
            event.contentOffset.y -
            event.contentSize.height
        );
        this.setState({ contentBottomOffset });
    };

    _scrollToKeyboardRequest = () => {
        if (!this._keyboardShow) return;

        const curFocusTarget = TextInput.State.currentlyFocusedField();
        if (!curFocusTarget) return;

        const scrollResponder = this._root && this._root.getScrollResponder();
        if (!scrollResponder) return;

        UIManager.viewIsDescendantOf(
            curFocusTarget,
            scrollResponder.getInnerViewNode(),
            (isAncestor) => {
                if (!isAncestor) return;

                const { text, selectionEnd, width, height } = this._getInputInfo(curFocusTarget);
                const cursorAtLastLine = !text ||
                    selectionEnd === undefined ||
                    text.length === selectionEnd;

                if (cursorAtLastLine) {
                    return this._scrollToKeyboard(curFocusTarget, 0);
                }

                this._measureCursorPosition(
                    text.substr(0, selectionEnd),
                    width,
                    cursorRelativeTopOffset => {
                        this._scrollToKeyboard(
                            curFocusTarget,
                            Math.max(0, height - cursorRelativeTopOffset)
                        );
                    }
                );
            }
        );
    };

    _scrollToKeyboard = (target, offset) => {
        const toKeyboardOffset = this._topOffset + this.props.keyboardOffset - offset;
        this._root.scrollResponderScrollNativeHandleToKeyboard(target, toKeyboardOffset, true);
    };

    _onKeyboardShow = () => {
        this._keyboardShow = true;
        this._scrollToKeyboardRequest();
    };

    _onKeyboardHide = () => {
        this._keyboardShow = false;
        let atBottom = !!this.state.contentBottomOffset;
        this.setState({ contentBottomOffset: 0 }, () => {
            if (atBottom) {
                setTimeout(() => {
                    this._root.scrollToEnd({ animated: true });
                });
            }
        });
    };

    _onTouchStart = ({ ...event }) => {
        const target = event.target || event.currentTarget;
        if (target === TextInput.State.currentlyFocusedField()) return false;

        const targetInst = event._targetInst;
        let uiViewClassName;
        uiViewClassName = targetInst.type || // >= react-native 0.49
            targetInst.viewConfig.uiViewClassName; // <= react-native 0.48
        return uiViewClassName === 'RCTTextField' || uiViewClassName === 'RCTTextView';
    };

    _onFocus = ({ ...event }) => {
        const target = event.target || event.currentTarget;
        TextInput.State.focusTextInput(target);

        const inputInfo = this._getInputInfo(target);
        const multiline = getProps(event._targetInst).multiline;

        if (multiline) {
            if (inputInfo.text === undefined) {
                const props = getProps(event._targetInst);
                inputInfo.text = props.value || props.defaultValue;
            }

            if (!isIOS) return;

            inputInfo.onFocusRequireScroll = true;
            setTimeout(() => {
                // 如果 onSelectionChange 没有触发，则在这里执行
                if (this._keyboardShow && inputInfo.onFocusRequireScroll) {
                    inputInfo.onFocusRequireScroll = false;
                    this._scrollToKeyboardRequest();
                }
            }, 250);
        } else {
            if (isIOS) this._scrollToKeyboardRequest();
        }
    };

    _onSelectionChange = ({ ...event }) => {
        const target = event.target || event.currentTarget;
        const inputInfo = this._getInputInfo(target);
        inputInfo.selectionEnd = event.nativeEvent.selection.end;
        if (inputInfo.text === undefined) {
            inputInfo.text = getProps(event._targetInst).value;
        }

        if (!isIOS) return;

        if (inputInfo.onFocusRequireScroll) {
            inputInfo.onFocusRequireScroll = false;
            this._scrollToKeyboardRequest();
        }
    };

    _onContentSizeChange = ({ ...event }) => {
        const target = event.target || event.currentTarget;
        const inputInfo = this._getInputInfo(target);
        inputInfo.width = event.nativeEvent.contentSize.width;
        inputInfo.height = event.nativeEvent.contentSize.height;
        if (inputInfo.text === undefined) {
            inputInfo.text = getProps(event._targetInst).value;
        }
        this._scrollToKeyboardRequest(true);
    };
}

function getProps(targetNode) {
    return targetNode.memoizedProps || // >= react-native 0.49
        targetNode._currentElement.props; // <= react-native 0.48
}

function isArray(arr) {
    return Object.prototype.toString.call(arr) === '[object Array]';
}

const styles = StyleSheet.create({
    wrap: {
        height: '100%',
    },

    hidden: {
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: 0,
    },
});
