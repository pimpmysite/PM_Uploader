<?php
if ( ! class_exists( 'PM_Uploader' ) ) {

require_once( 'class-pm.php' );

class PM_Uploader {

    public function __construct () {
        add_action( 'admin_enqueue_scripts'  , array( $this, 'admin_enqueue_scripts' ) );
        add_action( 'admin_print_styles'     , array( $this, 'admin_print_styles' ) );
        add_action( 'wp_ajax_pm-upload-media', array( $this, 'upload_media' ) );
        add_action( 'wp_ajax_pm-delete-media', array( $this, 'delete_media' ) );
    }

    public function render( $args, $obj=null ) {
        echo self :: get_html( $args, $obj );
    }
    
    public function get_html( $args, $obj=null ) {
        $html = '';
        
        if ( is_multisite() && ! is_upload_space_available() ) {
            $space = get_space_allowed();
            $html  = apply_filters( 
                'pm_uploader_space_not_available',
                '<p>' . sprintf( __( 'Sorry, you have filled your storage quota (%s MB).' ), $space ) . '</p>',
                $space
            );
            return $html;
        }

        $r = wp_parse_args( $args, array(
            'field_id'     => ''
          , 'field_name'   => ''
          , 'media_id'     => array()
          , 'size'         => 'medium'
          , 'multi'        => false
          , 'close_letter' => '&times;'
        ) );
        extract( $r, EXTR_SKIP );   

        if ( empty( $field_id ) )
            return '';

        if ( is_a( $obj, 'WP_Widget' ) ) {
            $number = absint( $obj->number );
            $field_name = $obj->get_field_name( $field_id );
            $field_id   = $obj->get_field_id  ( $field_id );
        }

        if ( empty( $field_name ) )
            $field_name = $field_id;

        $html .= sprintf(
            '<div id="%1$s-container" class="pm-upload-container" data-multi="%3$s" data-id="%1$s" data-name="%2$s">',
            $field_id,
            $field_name,
            ( $multi ? 1 : 0 )
        );
        
        if ( ! _device_can_upload() ) {
            $html .= '<p>' .  __( 'The web browser on your device cannot be used to upload files. You may be able to use the <a href="http://wordpress.org/extend/mobile/">native app for your device</a> instead.' ) . '</p>';
        } else {            
            $media_id = (array) $media_id;
                            
            if ( $multi )
                $field_name .= '[]';
            else
                $media_id = array_shift( $media_id );
            
            $del = sprintf(
                '<a href="#" class="delete">%s</a>',
                $close_letter
            );
    
            $images = array();
            $i = 0;
            foreach ( (array) $media_id as $id ) {
                if ( $tag = wp_get_attachment_image( $id, $size ) ) {
                    $input = sprintf(
                        '<input class="media-id" type="hidden" name="%1$s" value="%4$s">'
                      , esc_attr( $field_name )
                      , esc_attr( $field_id )
                      , $i
                      , esc_attr( $id )
                    );
                    $images[] = sprintf(
                        '<div class="image"><div class="centered">%1$s</div>%2$s%3$s</div>'
                      , $tag
                      , $del
                      , $input
                    );
                }
                $i++;
            }

            $html .= sprintf(
                '<div class="upload-dropzone">%s</div>'
              , __('Drop a file here or <a href="#" class="upload">select a file</a>.')
            );
            $html .= sprintf(
                '<div class="upload-fallback"><span class="button-secondary">%s</span></div>'
              , __('Select File')
            );
            $html .= sprintf(
                '<div class="images">%s</div>'
              , join( '', $images )
            );
        }
                
        return $html . '</div>';
    }

    public function get_plupload_settings() {
        $max_upload_size = wp_max_upload_size();
    
        $defaults = array(
          , 'runtimes'            => 'html5,silverlight,flash,html4'
          , 'file_data_name'      => 'async-upload' // key passed to $_FILE.
          , 'multiple_queues'     => true
          , 'max_file_size'       => $max_upload_size . 'b'
          , 'url'                 => admin_url( 'admin-ajax.php', 'relative' )
          , 'flash_swf_url'       => includes_url( 'js/plupload/plupload.flash.swf' )
          , 'silverlight_xap_url' => includes_url( 'js/plupload/plupload.silverlight.xap' )
          , 'filters'             => array( array( 'title' => __( 'Allowed Files' ), 'extensions' => '*') )
          , 'multipart'           => true,
          , 'urlstream_upload'    => true,
        );
    
        // Multi-file uploading doesn't currently work in iOS Safari,
        // single-file allows the built-in camera to be used as source for images
        if ( wp_is_mobile() )
            $defaults['multi_selection'] = false;
    
        $defaults = apply_filters( 'pm_plupload_default_settings', $defaults );
    
        $params = array(
            'action'  => 'pm-upload-media',
            'post_id' => isset( $_REQUEST['post'] ) ? absint( $_REQUEST['post'] ) : 0,
        );
    
        $params = apply_filters( 'pm_plupload_default_params', $params );
        $params['_wpnonce'] = wp_create_nonce( 'media-form' );
        $defaults['multipart_params'] = $params;
    
        return array(
            'defaults' => $defaults
          , 'browser'  => array(
                'mobile'    => wp_is_mobile()
              , 'supported' => _device_can_upload()
            )
          , 'limitExceeded' => is_multisite() && ! is_upload_space_available()
        );
    }

    public function admin_enqueue_scripts( $hook_suffix ) {
        wp_enqueue_script( 'jquery' );
        wp_enqueue_script( 'wp-plupload' );

        wp_enqueue_script( 'pm-uploader', PM :: realuri( '/js/pm-uploader.js' ), array( 'jquery', 'wp-plupload' ), false, true );
        wp_localize_script( 'pm-uploader', '_pmPluploadSettings', $this->get_plupload_settings() );
    }   

    public function admin_print_styles() {
        wp_enqueue_style( 'pm-uploader', PM :: realuri( '/css/pm-uploader.css' ), array(), false, 'screen' );
    }   

    public function upload_media() {
        check_ajax_referer( 'media-form' );
    
        if ( ! current_user_can( 'upload_files' ) )
            wp_die(__('You do not have permission to upload files.'));
                
        if ( isset( $_REQUEST['post_id'] ) && $post_id = $_REQUEST['post_id'] ) {
            if ( ! current_user_can( 'edit_post', $post_id ) )
            wp_die( __( 'You are not allowed to edit this item.' ) );
        } else {
            $post_id = null;
        }
    
        $media_id = (int) @$_REQUEST['media_id']; 
          
        $delete = 0;
        if ( $media_id )
            $delete = wp_delete_post( $media_id, true );
    
        $post_data = isset( $_REQUEST['post_data'] ) ? $_REQUEST['post_data'] : array();
    
        $attachment_id = media_handle_upload( 'async-upload', $post_id, $post_data );
    
        if ( is_wp_error( $attachment_id ) ) {
            echo json_encode( array(
                'type' => 'error'
              , 'data' => array(
                    'message'  => $attachment_id->get_error_message()
                  , 'filename' => $_FILES['async-upload']['name']
                )
            ) );
            exit;
        }
            
        $post = get_post( $attachment_id );
    
        echo json_encode( array(
            'success'   => 1
          , 'data'      => array(
                'old_id'    => $media_id
              , 'delete'    => $delete
              , 'id'        => $attachment_id
              , 'title'     => esc_attr( $post->post_title )
              , 'filename'  => esc_html( basename( $post->guid ) )
              , 'url'       => wp_get_attachment_url( $attachment_id )
              , 'meta'      => wp_get_attachment_metadata( $attachment_id )
            )
        ) );
        exit;
    }

    public function delete_media() {    
        check_ajax_referer( 'media-form' );

        if ( isset( $_REQUEST['post_id'] ) ) {
            $post_id = $_REQUEST['post_id'];
            if ( ! current_user_can( 'edit_post', $post_id ) )
                wp_die( -1 );
        }
        
        $media_id = (int) @$_REQUEST['media_id'];
    
        if ( ! wp_delete_post( $media_id, true ) ) {
            echo json_encode( array(
                'type' => 'error'
              , 'data' => array(
                    'id'  => $media_id
                )
            ) );
            wp_die();
        };

        echo json_encode( array(
            'type' => 'success'
          , 'data' => array(
                'id'=> $media_id
            )
        ) );
        wp_die();           
    }
}
}