var wpWidgets

!function($){
    var Uploader

    if ( typeof _pmPluploadSettings === 'undefined' )
        return;

    Uploader = function (element, options) {
        var self = this
          , elements = {
                container: 'container'
              , browser:   'browse_button'
              , dropzone:  'drop_element'
            }
          , key
          , error;
            
        this.options = $.extend({}, $.fn.uploader.defaults, options)
        this.container = $(element);
        this.browser   = this.container.find(this.options.browser)
        this.dropzone  = this.container.find(this.options.dropzone)

        this.supports = {
            upload: Uploader.browser.supported
        };

        this.supported = this.supports.upload;

        if ( ! this.supported )
            return;

        // Use deep extend to ensure that multipart_params and other objects are cloned.
        this.plupload = $.extend( true, { multipart_params: {} }, Uploader.defaults );

        // Extend the instance with options
        //
        // Use deep extend to allow options.plupload to override individual
        // default plupload keys.
        $.extend( true, this, options );

        // Proxy all methods so this always refers to the current instance.
        for ( key in this ) {
            if ( $.isFunction( this[ key ] ) )
                this[ key ] = $.proxy( this[ key ], this );
        }

        // Ensure all elements are jQuery elements and have id attributes
        // Then set the proper plupload arguments to the ids.
        for ( key in elements ) {
            if ( ! this[ key ] )
                continue;

            this[ key ] = $( this[ key ] ).first();

            if ( ! this[ key ].length ) {
                delete this[ key ];
                continue;
            }

            if ( ! this[ key ].prop('id') )
                this[ key ].prop( 'id', '__pm-uploader-id-' + Uploader.uuid++ );
            this.plupload[ elements[ key ] ] = this[ key ].prop('id');
        }

        // If the uploader has neither a browse button nor a dropzone, bail.
        if ( ! ( this.browser && this.browser.length ) && ! ( this.dropzone && this.dropzone.length ) )
            return;

        this.plupload.multi_selection = this.container.data('multi') && ! this.browser.mobile;
        this.uploader = new plupload.Uploader( this.plupload );
        delete this.plupload;

        // Set default params and remove this.params alias.
        this.param( this.params || {} );
        delete this.params;

        error = function( message, data, file ) {
            if ( file.attachment )
                file.attachment.destroy();

            Uploader.errors.unshift({
                message: message || pluploadL10n.default_error
              , data:    data
              , file:    file
            });

            self.error( message, data, file );
        };
        
        this.uploader.init();

        this.supports.dragdrop = this.uploader.features.dragdrop && ! Uploader.browser.mobile;

        // Generate drag/drop helper classes.
        (function( dropzone, supported ) {
            var timer, active;

            if ( ! dropzone )
                return;

            dropzone.toggleClass( 'supports-drag-drop', !! supported );

            if ( ! supported )
                return dropzone.unbind('.wp-uploader');

            // 'dragenter' doesn't fire correctly,
            // simulate it with a limited 'dragover'
            dropzone.bind( 'dragover.wp-uploader', function(){
                if ( timer )
                    clearTimeout( timer );

                if ( active )
                    return;

                dropzone.addClass('drag-over');
                active = true;
            });

            dropzone.bind('dragleave.wp-uploader, drop.wp-uploader', function(){
                // Using an instant timer prevents the drag-over class from
                // being quickly removed and re-added when elements inside the
                // dropzone are repositioned.
                //
                // See http://core.trac.wordpress.org/ticket/21705
                timer = setTimeout( function() {
                    active = false;
                    dropzone.trigger('dropzone:leave').removeClass('drag-over');
                }, 0 );
            });
        }( this.dropzone, this.supports.dragdrop ));

        if ( this.browser ) {
            this.browser.on( 'mouseenter', this.refresh );
        } else {
            this.uploader.disableBrowse( true );
            // If HTML5 mode, hide the auto-created file container.
            $('#' + this.uploader.id + '_html5_container').hide();
        }

        this.uploader.bind( 'FilesAdded', function( up, files ) {
            _.each( files, function( file ) {
                var attributes, image;

                // Ignore failed uploads.
                if ( plupload.FAILED === file.status )
                    return;

                // Generate attributes for a new `Attachment` model.
                attributes = _.extend({
                    file       : file
                  , uploading  : true
                  , date       : new Date()
                  , filename   : file.name
                  , menuOrder  : 0
                  , uploadedTo : wp.media.model.settings.post.id
                }, _.pick( file, 'loaded', 'size', 'percent' ) );

                // Handle early mime type scanning for images.
                image = /(?:jpe?g|png|gif)$/i.exec( file.name );

                // Did we find an image?
                if ( image ) {
                    attributes.type = 'image';

                    // `jpeg`, `png` and `gif` are valid subtypes.
                    // `jpg` is not, so map it to `jpeg`.
                    attributes.subtype = ( 'jpg' === image[0] ) ? 'jpeg' : image[0];
                }

                // Create the `Attachment`.
                file.attachment = wp.media.model.Attachment.create( attributes );

                Uploader.queue.add( file.attachment );

                self.added( file.attachment );
            });

            up.refresh();
            up.start();
        });

        this.uploader.bind( 'UploadProgress', function( up, file ) {
            file.attachment.set( _.pick( file, 'loaded', 'percent' ) );
            self.progress( file.attachment );
        });

        this.uploader.bind( 'FileUploaded', function( up, file, response ) {
            var complete;

            try {
                response = JSON.parse( response.response );
            } catch ( e ) {
                return error( pluploadL10n.default_error, e, file );
            }

            if ( ! _.isObject( response ) || _.isUndefined( response.success ) )
                return error( pluploadL10n.default_error, null, file );
            else if ( ! response.success )
                return error( response.data && response.data.message, response.data, file );

            _.each(['file','loaded','size','percent'], function( key ) {
                file.attachment.unset( key );
            });

            file.attachment.set( _.extend( response.data, { uploading: false }) );
            wp.media.model.Attachment.get( response.data.id, file.attachment );

            complete = Uploader.queue.all( function( attachment ) {
                return ! attachment.get('uploading');
            });

            if ( complete )
                Uploader.queue.reset();

            self.success( file.attachment );
        });

        this.uploader.bind( 'Error', function( up, pluploadError ) {
            var message = pluploadL10n.default_error,
                key;

            // Check for plupload errors.
            for ( key in Uploader.errorMap ) {
                if ( pluploadError.code === plupload[ key ] ) {
                    message = Uploader.errorMap[ key ];
                    if ( _.isFunction( message ) )
                        message = message( pluploadError.file, pluploadError );
                    break;
                }
            }

            error( message, pluploadError, pluploadError.file );
            up.refresh();
        });

        this.container.delegate(this.options.delete, 'click.uploader.pmwp', function() {
            self.delete( this );
            return false;
        });

        this.init();
    }

    $.extend( Uploader, _pmPluploadSettings );

    Uploader.uuid = 0;

    Uploader.errorMap = {
        'FAILED'                 : pluploadL10n.upload_failed
      , 'FILE_EXTENSION_ERROR'   : pluploadL10n.invalid_filetype
      , 'IMAGE_FORMAT_ERROR'     : pluploadL10n.not_an_image
      , 'IMAGE_MEMORY_ERROR'     : pluploadL10n.image_memory_exceeded
      , 'IMAGE_DIMENSIONS_ERROR' : pluploadL10n.image_dimensions_exceeded
      , 'GENERIC_ERROR'          : pluploadL10n.upload_failed
      , 'IO_ERROR'               : pluploadL10n.io_error
      , 'HTTP_ERROR'             : pluploadL10n.http_error
      , 'SECURITY_ERROR'         : pluploadL10n.security_error

      , 'FILE_SIZE_ERROR'        : function( file ) {
            return pluploadL10n.file_exceeds_size_limit.replace('%s', file.name);
        }
    };

    $.extend( Uploader.prototype, {     
        param: function( key, value ) {
            if ( arguments.length === 1 && typeof key === 'string' )
                return this.uploader.settings.multipart_params[ key ];

            if ( arguments.length > 1 ) {
                this.uploader.settings.multipart_params[ key ] = value;
            } else {
                $.extend( this.uploader.settings.multipart_params, key );
            }
        }

      , init:     function() {
            if ( this.supports.dragdrop )
                return

            // Maintain references while wrapping the fallback button.
            var fallback = this.container.find( '.upload-fallback' )
              , button   = fallback.children().detach()

            this.browser.detach().empty().append( button )
            fallback.append( this.browser ).show()          
        }
      , error:    function() {}
      , success:  function(attachment) {
            var multi   = this.container.data('multi')
              , name    = this.container.data('name')
              , input   = this.options.input.replace('.', '')
              , $images = this.container.find(this.options.images)
              
            if (multi)
                name = name + '[]'
            else
                $images.empty()
            
            attachment.element = 
                $( '<div class="image" />' )
                .hide()
                .append( '<div class="centered"><img src="' +  attachment.attributes.url+ '" /></div>' )
                .append( '<a href="#" class="delete">&times;</a>' ) // ToDo: Use close_letter
                .append( '<input class="'+input+'" type="hidden" name="'+name+'" value="'+attachment.id+'">' )
                .appendTo( $images )
                .fadeIn('fast')         
        }
      , added:    function() {
            if(! this.container.data('multi'))
                this.param('media_id', this.container.find(this.options.input).val()+' not multi')          
             else
                this.param('media_id', this.container.find(this.options.input).val()+' multi')          
        }
      , progress: function() {}
      , complete: function() {}
      , refresh:  function() {
            var node, attached, container, id;

            if ( this.browser ) {
                node = this.browser[0];

                // Check if the browser node is in the DOM.
                while ( node ) {
                    if ( node === document.body ) {
                        attached = true;
                        break;
                    }
                    node = node.parentNode;
                }

                // If the browser node is not attached to the DOM, use a
                // temporary container to house it, as the browser button
                // shims require the button to exist in the DOM at all times.
                if ( ! attached ) {
                    id = 'wp-uploader-browser-' + this.uploader.id;

                    container = $( '#' + id );
                    if ( ! container.length ) {
                        container = $('<div class="wp-uploader-browser" />').css({
                            position: 'fixed',
                            top: '-1000px',
                            left: '-1000px',
                            height: 0,
                            width: 0
                        }).attr( 'id', 'wp-uploader-browser-' + this.uploader.id ).appendTo('body');
                    }

                    container.append( this.browser );
                }
            }

            this.uploader.refresh();
        }
      , delete: function (e) {
            var that   = this
              , $image = $(e).parent()
              , data   = {
                    action      : 'pm-delete-media'
                  , media_id    : $image.find(this.options.input).val()
                  , _ajax_nonce : this.param('_wpnonce') 
                }

            $.post(this.uploader.settings.url, data, function (json, status) {
                try {
                    response = JSON.parse( json )
                } catch ( e ) {
                    return that.error( pluploadL10n.default_error, e )
                }
                if ( 'success' === response.type )
                    $image.fadeOut('fast', function(){$(this).remove()})
            })
        }
    });
    
    Uploader.queue = new wp.media.model.Attachments( [], { query: false });
    Uploader.errors = new Backbone.Collection();
     
    $.fn.uploader = function (option) {
        return this.each(function () {
            var $this = $(this)
              , data  = $this.data('uploader')
            if (!data && -1 == $this.prop('id').indexOf('__i__')) 
                $this.data('uploader', (data = new Uploader(this, option)))
        })
    }
    
    $.fn.uploader.defaults = {
        browser  : '.upload'
      , dropzone : '.upload-dropzone'
      , images   : '.images'
      , input    : '.media-id'
      , delete   : '.delete'
    }
        
    $.fn.uploader.Constructor = Uploader
    
    $('.pm-upload-container').uploader()
    
    if (typeof wpWidgets !== 'undefined') {
        wpWidgets.saveOrg = wpWidgets.save
        wpWidgets.save = function (widget, del, animate, order) {
            wpWidgets.saveOrg(widget, del, animate, order)
            if (widget.find('input.add_new').val()) {
                widget.find('.upload-container').uploader()             
            }
        }
        
        wpWidgets.appendTitleOrg = wpWidgets.appendTitle
        wpWidgets.appendTitle = function(widget) {
            switch ($('.id_base', widget).val()) {
                case 'header':
                case 'banner':
                case 'image' :
                    var title = $('input[id*="-alt"]', widget).val() || ''
        
                    if ( title )
                        title = ': ' + title.replace(/<[^<>]+>/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        
                    $(widget).children('.widget-top').children('.widget-title').children()
                        .children('.in-widget-title').html(title)               
                    /*
                    $(widget).children('.widget-top').children('.widget-title').children()
                        .children('.in-widget-title').prepend(': ' ).append($('.image img', widget).clone());               
                    */
                    break
                default:
                    wpWidgets.appendTitleOrg(widget)            
            }   
        }
    }       

}(window.jQuery)