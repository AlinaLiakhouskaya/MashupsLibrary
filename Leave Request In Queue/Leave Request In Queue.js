tau.mashups
    .addDependency('jQuery')
    .addDependency('app.path')
    .addDependency('tau/core/global.bus')
    .addDependency('tau/configurator')
    .addMashup(function($, appPath, gb, c) {
        var store = c.getStore();
        var typeById = {};

        gb.get().on('beforeInit', function(e) {
            var config = e.data.config;
            if (config && config.action === 'show') {
                var type, id;
                var entity = config.entity;
                if (typeof entity === 'object' && entity.type) {
                    type = entity.type.toLowerCase();
                    id = entity.id;
                } else if (typeof entity === 'string') {
                    type = entity.toLowerCase();
                    id = config.id;
                }
                if (type && id && !typeById[id]) {
                    typeById[id] = type;
                }
            }
        });

        var requestAddCommentHook = {
            question: 'Leave Request in Queue?',
            answers: [
                //unique id, css class, text
                ['keep-in-queue', '', 'Keep in queue'],
                ['remove-and-close', 'tau-primary', 'Remove and close, as usual'],
                ['remove-keep-open', 'tau-danger', 'Remove but keep open']
            ],
            skippedTypes: ['Idea'],
            skippedProjects: [14272], //DevOps
            requestViewUrl: appPath.get() + '/Project/HelpDesk/Request/View.aspx',
            soapCommentUrl: (appPath.get() + '/Services/CommentsControl.asmx/Create').replace(location.protocol + '//' + location.host, ''),
            restCommentUrl: appPath.get() + '/api/v1/comments.asmx/?',

            render: function() {
            },

            _isRestCommentCreatedForRequest: function(jqXHROptions) {
                if (jqXHROptions.url && jqXHROptions.url.indexOf(this.restCommentUrl) === 0) {
                    var data = JSON.parse(jqXHROptions.data);
                    var general = data.general;
                    return general && (typeById[general.id] === 'request' ||
                        location.hash && location.hash.indexOf('#request/' + general.id) === 0);
                }
                return false;
            },

            _isSoapCommentCreatedForRequest: function(jqXHROptions) {
                if (jqXHROptions.url && jqXHROptions.url.indexOf(this.soapCommentUrl) === 0 &&
                    (location.protocol + '//' + location.host + location.pathname).indexOf(this.requestViewUrl) === 0) {
                    var data = JSON.parse(jqXHROptions.data);
                    return data.comment && location.search.indexOf('RequestID=' + data.comment.GeneralID) > 0;
                }
                return false;
            },

            updateRequest: function(generalId, data) {
                $.ajax({
                    url: appPath.get() + '/api/v1/Requests/' + generalId,
                    data: data,
                    headers: {'Content-Type': 'application/json'},
                    success: $.noop,
                    error: $.noop,
                    dataType: 'json',
                    type: 'POST'
                });
            }
        };

        $.ajaxTransport('+', $.proxy(function(options, originalOptions, jqXHR) {
            if (options.postponed !== true) {
                return;
            }

            var questionHolder, isRestComment, isSoapComment, d;
            if (isRestComment = requestAddCommentHook._isRestCommentCreatedForRequest(options)) {
                d = JSON.parse(options.data);
                questionHolder = $('div.ui-richeditor__controls__status_message:first');
            } else if (isSoapComment = requestAddCommentHook._isSoapCommentCreatedForRequest(options)) {
                d = JSON.parse(options.data);
                questionHolder = d.comment.ParentID ? $('button:contains("Reply").ui-add-comment') : $('button:contains("Comment").ui-add-comment');
            }

            if (!questionHolder || questionHolder.length !== 1) {
                return;
            }

            var successCallback, errorCallback;
            var showQuestion = $.proxy(function(q) {
                if (q.next('.tau-bubble').length > 0) {
                    return;
                }

                var layout = '<div class="tau-bubble" style="z-index: 1; display: block;">' +
                    '<div class="tau-bubble__inner" style="margin: -2px 1px -2px 1px !important;"><div style="padding: 10px;">' +
                    '<p style="margin: 0px !important;">' + this.question + '</p><div class="tau-buttons">';
                for (var i = 0; i < this.answers.length; i++) {
                    layout += '<div class="tau-buttons__control"><button id="' + this.answers[i][0] + '" class="tau-btn ' +
                        this.answers[i][1] + '" type="button">' + this.answers[i][2] + '</div></button>';
                }
                layout += '</div></div></div><div class="tau-bubble__arrow" data-orientation="bottom" style="display: block;"></div></div>';
                q.after(layout);
                var b = q.next('.tau-bubble');

                var removeAssignments = function(generalId, close) {
                    $.ajax({
                        url: appPath.get() + '/api/v1/Requests/' + generalId + '?include=[Project[Process[Id]],Assignments]&resultFormat=json',
                        headers: {'Content-Type': 'application/json'},
                        success: function(result) {
                            //close request
                            if (close == true) {
                                var processId = result.Project.Process.Id;
                                $.ajax({
                                    url: appPath.get() + '/api/v1/processes/' + processId +
                                    '/entitystates?where=(IsFinal eq 1)and(EntityType.Name eq %27Request%27)&include=[Id]&resultFormat=json',
                                    headers: {'Content-Type': 'application/json'},
                                    success: function(stateId) {
                                        requestAddCommentHook.updateRequest(generalId, JSON.stringify({
                                            IsReplied: true,
                                            EntityState: {Id: stateId.Items[0].Id, Name: 'Closed'}
                                        }));
                                    },
                                    error: $.noop,
                                    dataType: 'json',
                                    type: 'GET'
                                });
                            }
                            //remove all assignments
                            result.Assignments.Items.forEach(function(id) {
                                $.ajax({
                                    url: appPath.get() + '/api/v1/Requests/' + generalId + '/Assignments/' + id.Id,
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'x-http-method-override': 'DELETE'
                                    },
                                    success: $.noop,
                                    error: $.noop,
                                    dataType: 'json',
                                    type: 'POST'
                                });
                            });
                        },
                        error: $.noop,
                        dataType: 'json',
                        type: 'GET'
                    });
                };

                var onAjaxSuccess = function(e, xhr, settings) {
                    $(document).off('ajaxSuccess', onAjaxSuccess);
                    var generalId, d;
                    if (requestAddCommentHook._isRestCommentCreatedForRequest(settings)) {
                        d = JSON.parse(settings.data);
                        generalId = d.general.id;
                    } else if (requestAddCommentHook._isSoapCommentCreatedForRequest(settings)) {
                        d = JSON.parse(settings.data);
                        generalId = d.comment.GeneralID;
                    }
                    switch (settings.selectedChoise) {
                        case 'keep-in-queue':
                            requestAddCommentHook.updateRequest(generalId, JSON.stringify({IsReplied: false}));
                            break;
                        case 'remove-and-close':
                            removeAssignments(generalId, true);
                            break;
                        case 'remove-keep-open':
                            requestAddCommentHook.updateRequest(generalId, JSON.stringify({IsReplied: true}));
                            removeAssignments(generalId, false);
                            break;
                    }
                };

                var bubbleHeight = b.height();
                if (isRestComment) {
                    var c = $('div.ui-all-comments');
                    if (q.position().top < bubbleHeight) {
                        c.css('paddingTop', bubbleHeight);
                    }
                }
                var p = q.position();
                b.css({
                    top: (p.top - bubbleHeight - ((isRestComment && d.parentId) ? $('div.ui-richeditor').height() : 0)) + 'px',
                    left: p.left + 'px'
                });
                b.on('click', 'button', function(e) {
                    options.postponed = false;
                    options.selectedChoise = e.target.id;
                    $(document).ajaxSuccess(onAjaxSuccess);
                    $.ajax(options).success(successCallback).error(errorCallback);
                    b.fadeOut(300, function() {
                        b.remove();
                    });
                });
                b.css('visibility', 'visible').animate({opacity: 1}, 300);
            }, this);

            if (isRestComment) {
                store.evictProperties(d.general.id, 'request', ['requestType', 'project']);
                store.get('request', {id: d.general.id, fields: [{'requestType': ['name']},{'project':['id']}]}, {
                    success: function(res) {
                        if ($.inArray(res.data.requestType.name, requestAddCommentHook.skippedTypes) === -1 && 
                            $.inArray(res.data.project.id, requestAddCommentHook.skippedProjects) === -1) {
                            showQuestion(questionHolder.eq(0));
                        } else {
                            options.postponed = false;
                            $.ajax(options).success(successCallback).error(errorCallback);
                        }
                    }
                }).done();
            } else if (isSoapComment) {
                showQuestion(questionHolder.eq(0));
            }

            jqXHR.success = function(callback) {
                if (options.postponed) {
                    successCallback = callback;
                    return this;
                } else {
                    $.ajax(options).success(callback);
                }
            };
            jqXHR.error = function(callback) {
                if (options.postponed) {
                    errorCallback = callback;
                    return this;
                } else {
                    $.ajax(options).error(callback);
                }
            };
            return {
                send: $.noop,
                abort: $.noop
            };
        }, requestAddCommentHook));

        $.ajaxPrefilter('json', function(options, originalOptions, jqXHR) {
            if (options.data && !options.hasOwnProperty('postponed')) {
                if (
                    requestAddCommentHook._isRestCommentCreatedForRequest(options) ||
                    requestAddCommentHook._isSoapCommentCreatedForRequest(options)
                ) {
                    options.postponed = true;
                }
            }
        });

        requestAddCommentHook.render();
    });
