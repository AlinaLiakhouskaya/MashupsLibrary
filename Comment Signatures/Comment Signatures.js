tau.mashups
	.addDependency('tp/userStory/view')
	.addDependency('tp/task/view')
	.addDependency('tp/request/view')
	.addDependency('tp/bug/view')
	.addDependency("jQuery")
	.addMashup(function(storyView, taskView, requestView, bugView, $, config) {
		/* our reused placement function */
		var placeSignature = function($element) {
			$element.delegate('span.ui-comments-add-link', 'click', function() {
				setTimeout(function() {
					$.ajax({
		                type: 'GET',
		                url: appHostAndPath+'/storage/v1/Signatures/Sigs',
		                contentType: 'application/json; charset=utf8',
						success: function(data) {
							try {
								if (data.userData) {
									var editor = $('span.ui-comments-add-link').parent('div').find('div.ui-richeditor span:first').id().match(/^(?:cke_)?(.*)/)[1];
									/* place the signature */
									CKEDITOR.instances[editor].setData('<br/><br/>'+unescape(data.userData.sig));
									/* reset focus to the front of the editor */
									CKEDITOR.instances[editor].focus();
								}
							} catch (e) {}
						}
		            });
				}, 750);
			});
		}
	
		/* go through our views and attach our placement function */
		storyView.onRender(placeSignature);
		taskView.onRender(placeSignature);
		requestView.onRender(placeSignature);
		bugView.onRender(placeSignature);
		
		/* block that renders the personal settings signature form */
		$(document).ready(function() {
			if ($('span.tableTitle').html() != 'Personal settings') return;
			var tr_head = $('<tr><td colspan="2"><b>Your Signature</b></td></tr>');
			tr_head.insertBefore($('b:contains("Your Photo")').parents('tr:first'));
			var tr_body = $('<tr><td colspan="2"></td></tr>');
			tr_body.insertAfter(tr_head);
			tr_body.find('td:first').html('<textarea id="signature" cols="55" rows="6"></textarea>');
			/* make it a rich text editor */
            require([appHostAndPath+'/ckeditor/ckeditor.js'], function() {
				CKEDITOR.replace('signature',{toolbar: 'Basic'});
            });
			/* bind to save */
			$('input.button[value="Save changes"]').click(function() {
				$.ajax({
                    type: 'POST',
                    async: false,
                    url: appHostAndPath+'/storage/v1/Signatures/Sigs',
                    data: JSON.stringify({
                        'scope'     : 'Private',
                        'publicData': null,
                        'userData'  : {'sig': escape($('textarea#signature').val())}
                    }),
                    contentType: 'application/json; charset=utf8'
                });
				return true;
			});
			/* get the existing value (if any) */
			$.ajax({
                type: 'GET',
                url: appHostAndPath+'/storage/v1/Signatures/Sigs',
                contentType: 'application/json; charset=utf8',
				success: function(data) {
					try {
						if (data.userData) {
							$('textarea#signature').val(unescape(data.userData.sig) || '');
							CKEDITOR.instances['signature'].setData(unescape(data.userData.sig));
						}
					} catch (e) {}
				}
            });
		});
    }
);